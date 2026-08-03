#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.IO;
using Roll4InitiativeVTT.Map;
using UnityEditor;
using UnityEngine;

namespace Roll4InitiativeVTT.EditorTools
{
    public sealed class MapHeightPainterWindow : EditorWindow
    {
        private const string DefaultMapJsonRelativePath = "../../Images/Arcane Library PZO30084E.map.json";
        private const float BlockerThreshold = 0.15f;

        private enum PaintMode
        {
            Height,
            Blocker
        }

        private string mapJsonPath;
        private MapDataSource mapData;
        private Texture2D mapTexture;
        private float[,] heightGrid;
        private bool[,] blockedGrid;
        private float paintHeightFt = 5f;
        private PaintMode paintMode = PaintMode.Height;
        private Vector2 scrollPosition;
        private bool dirty;
        private string statusMessage;

        [MenuItem("Tools/Roll4Initiative/Map Height Painter")]
        public static void Open()
        {
            GetWindow<MapHeightPainterWindow>("Map Height Painter");
        }

        private void OnEnable()
        {
            if (string.IsNullOrWhiteSpace(mapJsonPath))
            {
                mapJsonPath = Path.GetFullPath(Path.Combine(Application.dataPath, DefaultMapJsonRelativePath));
            }
        }

        private void OnGUI()
        {
            DrawToolbar();

            if (mapData == null || mapTexture == null || heightGrid == null)
            {
                EditorGUILayout.HelpBox("Load a map JSON file to begin painting heights.", MessageType.Info);
                return;
            }

            scrollPosition = EditorGUILayout.BeginScrollView(scrollPosition);
            DrawMapPreview();
            EditorGUILayout.EndScrollView();
        }

        private void DrawToolbar()
        {
            EditorGUILayout.BeginVertical(EditorStyles.helpBox);

            EditorGUILayout.BeginHorizontal();
            mapJsonPath = EditorGUILayout.TextField(mapJsonPath ?? string.Empty);
            if (GUILayout.Button("Browse", GUILayout.Width(70f)))
            {
                string chosenPath = EditorUtility.OpenFilePanel("Select map JSON", Path.GetDirectoryName(mapJsonPath) ?? string.Empty, "json");
                if (!string.IsNullOrWhiteSpace(chosenPath))
                {
                    mapJsonPath = chosenPath;
                    LoadMap();
                }
            }
            if (GUILayout.Button("Load", GUILayout.Width(60f)))
            {
                LoadMap();
            }
            if (GUILayout.Button("Save", GUILayout.Width(60f)))
            {
                SaveMap();
            }
            if (GUILayout.Button("Import Blockers", GUILayout.Width(120f)))
            {
                ImportBlockersFromTexture();
            }
            EditorGUILayout.EndHorizontal();

            EditorGUILayout.BeginHorizontal();
            paintHeightFt = EditorGUILayout.FloatField(new GUIContent("Paint Height Ft"), paintHeightFt);
            paintMode = (PaintMode)GUILayout.Toolbar((int)paintMode, new[] { "Height", "Blocker" });
            EditorGUILayout.EndHorizontal();

            EditorGUILayout.BeginHorizontal();
            if (GUILayout.Button("Set To Default"))
            {
                paintHeightFt = mapData != null ? mapData.defaultHeightFt : 0f;
            }
            if (GUILayout.Button("Reload"))
            {
                LoadMap();
            }
            GUILayout.FlexibleSpace();
            GUILayout.Label(dirty ? "Dirty" : "Clean", EditorStyles.miniLabel, GUILayout.Width(40f));
            EditorGUILayout.EndHorizontal();

            if (!string.IsNullOrWhiteSpace(statusMessage))
            {
                EditorGUILayout.HelpBox(statusMessage, MessageType.None);
            }

            EditorGUILayout.EndVertical();
        }

        private void DrawMapPreview()
        {
            float aspect = (float)mapData.gridWidth / mapData.gridHeight;
            Rect previewRect = GUILayoutUtility.GetAspectRect(aspect, GUILayout.ExpandWidth(true));

            EditorGUI.DrawPreviewTexture(previewRect, mapTexture, null, ScaleMode.StretchToFill);
            DrawHeightOverlay(previewRect);
            DrawBlockedOverlay(previewRect);
            DrawGridLines(previewRect);
            HandlePaintInput(previewRect);
        }

        private void DrawHeightOverlay(Rect previewRect)
        {
            float cellWidth = previewRect.width / mapData.gridWidth;
            float cellHeight = previewRect.height / mapData.gridHeight;
            float maxHeight = GetMaxPaintedHeight();

            for (int x = 0; x < mapData.gridWidth; x++)
            {
                for (int y = 0; y < mapData.gridHeight; y++)
                {
                    float cellHeightFt = heightGrid[x, y];
                    if (Mathf.Approximately(cellHeightFt, mapData.defaultHeightFt))
                    {
                        continue;
                    }

                    float normalized = maxHeight <= mapData.defaultHeightFt
                        ? 0f
                        : Mathf.InverseLerp(mapData.defaultHeightFt, maxHeight, cellHeightFt);
                    Color fill = Color.Lerp(new Color(0.05f, 0.45f, 0.9f, 0.18f), new Color(1f, 0.35f, 0.1f, 0.32f), normalized);

                    Rect cellRect = new Rect(
                        previewRect.x + x * cellWidth,
                        previewRect.y + previewRect.height - (y + 1) * cellHeight,
                        cellWidth,
                        cellHeight);
                    EditorGUI.DrawRect(cellRect, fill);
                    GUI.Label(cellRect, cellHeightFt.ToString("0.##"), EditorStyles.centeredGreyMiniLabel);
                }
            }
        }

        private void DrawBlockedOverlay(Rect previewRect)
        {
            if (blockedGrid == null)
            {
                return;
            }

            float cellWidth = previewRect.width / mapData.gridWidth;
            float cellHeight = previewRect.height / mapData.gridHeight;

            for (int x = 0; x < mapData.gridWidth; x++)
            {
                for (int y = 0; y < mapData.gridHeight; y++)
                {
                    if (!blockedGrid[x, y])
                    {
                        continue;
                    }

                    Rect cellRect = new Rect(
                        previewRect.x + x * cellWidth,
                        previewRect.y + previewRect.height - (y + 1) * cellHeight,
                        cellWidth,
                        cellHeight);
                    EditorGUI.DrawRect(cellRect, new Color(0.85f, 0.15f, 0.15f, 0.32f));
                }
            }
        }

        private void DrawGridLines(Rect previewRect)
        {
            float cellWidth = previewRect.width / mapData.gridWidth;
            float cellHeight = previewRect.height / mapData.gridHeight;

            Handles.BeginGUI();
            Handles.color = new Color(1f, 1f, 1f, 0.18f);
            for (int x = 0; x <= mapData.gridWidth; x++)
            {
                float xPos = previewRect.x + x * cellWidth;
                Handles.DrawLine(new Vector3(xPos, previewRect.y), new Vector3(xPos, previewRect.yMax));
            }
            for (int y = 0; y <= mapData.gridHeight; y++)
            {
                float yPos = previewRect.y + y * cellHeight;
                Handles.DrawLine(new Vector3(previewRect.x, yPos), new Vector3(previewRect.xMax, yPos));
            }
            Handles.EndGUI();
        }

        private void HandlePaintInput(Rect previewRect)
        {
            Event e = Event.current;
            if (!previewRect.Contains(e.mousePosition))
            {
                return;
            }

            if (e.type != EventType.MouseDown && e.type != EventType.MouseDrag)
            {
                return;
            }

            if (e.button != 0)
            {
                if (e.button != 1)
                {
                    return;
                }
            }

            Vector2Int cell = ScreenToCell(previewRect, e.mousePosition);
            if (!IsValidCell(cell.x, cell.y))
            {
                return;
            }

            bool erase = e.button == 1;

            if (paintMode == PaintMode.Height)
            {
                heightGrid[cell.x, cell.y] = erase ? mapData.defaultHeightFt : paintHeightFt;
            }
            else
            {
                blockedGrid[cell.x, cell.y] = !erase;
            }

            dirty = true;
            statusMessage = paintMode == PaintMode.Height
                ? $"Height ({cell.x}, {cell.y}) = {heightGrid[cell.x, cell.y]:0.##} ft"
                : $"Blocker ({cell.x}, {cell.y}) = {(blockedGrid[cell.x, cell.y] ? "on" : "off")}";
            e.Use();
            Repaint();
        }

        private Vector2Int ScreenToCell(Rect previewRect, Vector2 mousePosition)
        {
            float localX = (mousePosition.x - previewRect.x) / previewRect.width;
            float localY = (mousePosition.y - previewRect.y) / previewRect.height;

            int cellX = Mathf.Clamp(Mathf.FloorToInt(localX * mapData.gridWidth), 0, mapData.gridWidth - 1);
            int cellYFromTop = Mathf.Clamp(Mathf.FloorToInt(localY * mapData.gridHeight), 0, mapData.gridHeight - 1);
            int cellY = (mapData.gridHeight - 1) - cellYFromTop;
            return new Vector2Int(cellX, cellY);
        }

        private bool IsValidCell(int x, int y)
        {
            return x >= 0 && x < mapData.gridWidth && y >= 0 && y < mapData.gridHeight;
        }

        private float GetMaxPaintedHeight()
        {
            float maxHeight = mapData != null ? mapData.defaultHeightFt : 0f;
            if (heightGrid == null)
            {
                return maxHeight;
            }

            for (int x = 0; x < mapData.gridWidth; x++)
            {
                for (int y = 0; y < mapData.gridHeight; y++)
                {
                    maxHeight = Mathf.Max(maxHeight, heightGrid[x, y]);
                }
            }

            return maxHeight;
        }

        private void LoadMap()
        {
            try
            {
                if (string.IsNullOrWhiteSpace(mapJsonPath) || !File.Exists(mapJsonPath))
                {
                    statusMessage = $"Map JSON not found at {mapJsonPath}";
                    return;
                }

                string json = File.ReadAllText(mapJsonPath);
                mapData = JsonUtility.FromJson<MapDataSource>(json);
                if (mapData == null)
                {
                    statusMessage = "Map JSON was empty or invalid.";
                    return;
                }

                string texturePath = ResolveRelativePath(mapJsonPath, mapData.imagePath);
                if (!File.Exists(texturePath))
                {
                    statusMessage = $"Map texture not found at {texturePath}";
                    return;
                }

                byte[] imageBytes = File.ReadAllBytes(texturePath);
                mapTexture = new Texture2D(2, 2, TextureFormat.RGBA32, false);
                if (!mapTexture.LoadImage(imageBytes))
                {
                    statusMessage = $"Could not load texture from {texturePath}";
                    return;
                }

                heightGrid = BuildHeightGrid(mapData);
                blockedGrid = BuildBlockedGrid(mapData);
                dirty = false;
                statusMessage = $"Loaded {Path.GetFileName(mapJsonPath)}";
            }
            catch (Exception exception)
            {
                statusMessage = exception.Message;
            }
        }

        private static float[,] BuildHeightGrid(MapDataSource data)
        {
            float[,] grid = new float[data.gridWidth, data.gridHeight];
            for (int x = 0; x < data.gridWidth; x++)
            {
                for (int y = 0; y < data.gridHeight; y++)
                {
                    grid[x, y] = data.defaultHeightFt;
                }
            }

            if (data.heightOverrides != null)
            {
                foreach (MapHeightOverride overrideEntry in data.heightOverrides)
                {
                    ApplyHeightOverride(grid, overrideEntry, data.gridWidth, data.gridHeight);
                }
            }

            return grid;
        }

        private void ImportBlockersFromTexture()
        {
            if (mapData == null || mapTexture == null)
            {
                return;
            }

            blockedGrid = BuildBlockedGridFromTexture(mapTexture, mapData.gridWidth, mapData.gridHeight);
            dirty = true;
            statusMessage = "Imported blockers from the texture.";
            Repaint();
        }

        private static bool[,] BuildBlockedGridFromTexture(Texture2D texture, int gridWidth, int gridHeight)
        {
            bool[,] blockedGrid = new bool[gridWidth, gridHeight];

            for (int x = 0; x < gridWidth; x++)
            {
                for (int y = 0; y < gridHeight; y++)
                {
                    blockedGrid[x, y] = IsTileBlocked(texture, x, y, gridWidth, gridHeight);
                }
            }

            return blockedGrid;
        }

        private static bool IsTileBlocked(Texture2D texture, int tileX, int tileY, int gridWidth, int gridHeight)
        {
            const int samplesPerAxis = 5;

            float luminanceSum = 0f;
            int sampleCount = 0;

            for (int sampleX = 0; sampleX < samplesPerAxis; sampleX++)
            {
                for (int sampleY = 0; sampleY < samplesPerAxis; sampleY++)
                {
                    float u = (tileX + (sampleX + 0.5f) / samplesPerAxis) / gridWidth;
                    float v = (tileY + (sampleY + 0.5f) / samplesPerAxis) / gridHeight;
                    Color color = texture.GetPixelBilinear(u, v);
                    luminanceSum += color.r * 0.299f + color.g * 0.587f + color.b * 0.114f;
                    sampleCount++;
                }
            }

            float averageLuminance = luminanceSum / sampleCount;
            return averageLuminance <= BlockerThreshold;
        }

        private static bool[,] BuildBlockedGrid(MapDataSource data)
        {
            bool[,] grid = new bool[data.gridWidth, data.gridHeight];

            if (data.blockedTiles == null)
            {
                return grid;
            }

            foreach (MapPoint point in data.blockedTiles)
            {
                if (point == null)
                {
                    continue;
                }

                if (point.x < 0 || point.x >= data.gridWidth || point.y < 0 || point.y >= data.gridHeight)
                {
                    continue;
                }

                grid[point.x, point.y] = true;
            }

            return grid;
        }

        private static void ApplyHeightOverride(float[,] grid, MapHeightOverride overrideEntry, int gridWidth, int gridHeight)
        {
            if (overrideEntry == null)
            {
                return;
            }

            int width = overrideEntry.width <= 0 ? 1 : overrideEntry.width;
            int height = overrideEntry.height <= 0 ? 1 : overrideEntry.height;

            for (int x = overrideEntry.x; x < overrideEntry.x + width; x++)
            {
                for (int y = overrideEntry.y; y < overrideEntry.y + height; y++)
                {
                    if (x < 0 || x >= gridWidth || y < 0 || y >= gridHeight)
                    {
                        continue;
                    }

                    grid[x, y] = overrideEntry.heightFt;
                }
            }
        }

        private void SaveMap()
        {
            if (mapData == null || heightGrid == null)
            {
                return;
            }

            mapData.heightOverrides = CompressHeightGrid(heightGrid, mapData.defaultHeightFt);
            mapData.blockedTiles = CompressBlockedGrid(blockedGrid);
            string json = JsonUtility.ToJson(mapData, true);
            File.WriteAllText(mapJsonPath, json);
            dirty = false;
            statusMessage = $"Saved {Path.GetFileName(mapJsonPath)}";
            AssetDatabase.Refresh();
        }

        private static List<MapPoint> CompressBlockedGrid(bool[,] grid)
        {
            List<MapPoint> points = new();
            if (grid == null)
            {
                return points;
            }

            int width = grid.GetLength(0);
            int height = grid.GetLength(1);

            for (int y = 0; y < height; y++)
            {
                for (int x = 0; x < width; x++)
                {
                    if (!grid[x, y])
                    {
                        continue;
                    }

                    points.Add(new MapPoint { x = x, y = y });
                }
            }

            return points;
        }

        private static List<MapHeightOverride> CompressHeightGrid(float[,] grid, float defaultHeightFt)
        {
            int width = grid.GetLength(0);
            int height = grid.GetLength(1);
            bool[,] visited = new bool[width, height];
            List<MapHeightOverride> overrides = new();

            for (int y = 0; y < height; y++)
            {
                for (int x = 0; x < width; x++)
                {
                    if (visited[x, y] || Mathf.Approximately(grid[x, y], defaultHeightFt))
                    {
                        continue;
                    }

                    float cellHeight = grid[x, y];
                    int rectWidth = 1;
                    while (x + rectWidth < width
                        && !visited[x + rectWidth, y]
                        && Mathf.Approximately(grid[x + rectWidth, y], cellHeight))
                    {
                        rectWidth++;
                    }

                    int rectHeight = 1;
                    bool canGrow = true;
                    while (y + rectHeight < height && canGrow)
                    {
                        for (int dx = 0; dx < rectWidth; dx++)
                        {
                            if (visited[x + dx, y + rectHeight] || !Mathf.Approximately(grid[x + dx, y + rectHeight], cellHeight))
                            {
                                canGrow = false;
                                break;
                            }
                        }

                        if (canGrow)
                        {
                            rectHeight++;
                        }
                    }

                    for (int dx = 0; dx < rectWidth; dx++)
                    {
                        for (int dy = 0; dy < rectHeight; dy++)
                        {
                            visited[x + dx, y + dy] = true;
                        }
                    }

                    overrides.Add(new MapHeightOverride
                    {
                        x = x,
                        y = y,
                        width = rectWidth,
                        height = rectHeight,
                        heightFt = cellHeight
                    });
                }
            }

            return overrides;
        }

        private static string ResolveRelativePath(string baseFilePath, string relativePath)
        {
            string baseDirectory = Path.GetDirectoryName(baseFilePath);
            if (string.IsNullOrEmpty(baseDirectory))
            {
                return Path.GetFullPath(relativePath);
            }

            return Path.GetFullPath(Path.Combine(baseDirectory, relativePath));
        }
    }
}
#endif
