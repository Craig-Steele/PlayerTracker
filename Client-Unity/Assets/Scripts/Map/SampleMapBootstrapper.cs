using System;
using System.Collections.Generic;
using System.IO;
using Roll4InitiativeVTT.Tokens;
using UnityEngine;

namespace Roll4InitiativeVTT.Map
{
    public sealed class SampleMapBootstrapper : MonoBehaviour
    {
        private const string SampleMapDataRelativePath = "../../Images/Arcane Library PZO30084E.map.json";
        private const float TileSize = 1f;
        private const float GroundThickness = 0.1f;
        private const float BlockerHeight = 3f;
        private const float BlockerThreshold = 0.15f;
        private const float TokenY = 0.5f;

        private static readonly Vector2Int TokenFloorPreferredTile = new(4, 4);
        private static readonly Vector2Int TokenCatwalkPreferredTile = new(19, 25);

        private void Awake()
        {
            ConfigureSampleMap();
        }

        private void ConfigureSampleMap()
        {
            string mapDataPath = Path.GetFullPath(Path.Combine(Application.dataPath, SampleMapDataRelativePath));
            if (!File.Exists(mapDataPath))
            {
                Debug.LogError($"Sample map bootstrap failed: map data not found at {mapDataPath}");
                return;
            }

            MapDataSource mapData;
            try
            {
                string mapJson = File.ReadAllText(mapDataPath);
                mapData = JsonUtility.FromJson<MapDataSource>(mapJson);
            }
            catch (Exception exception)
            {
                Debug.LogError($"Sample map bootstrap failed: could not parse map data at {mapDataPath}\n{exception}");
                return;
            }

            if (mapData == null)
            {
                Debug.LogError($"Sample map bootstrap failed: map data JSON at {mapDataPath} was empty or invalid.");
                return;
            }

            if (mapData.gridWidth <= 0 || mapData.gridHeight <= 0)
            {
                Debug.LogError(
                    $"Sample map bootstrap failed: invalid grid size {mapData.gridWidth}x{mapData.gridHeight} in {mapDataPath}");
                return;
            }

            if (string.IsNullOrWhiteSpace(mapData.imagePath))
            {
                Debug.LogError($"Sample map bootstrap failed: imagePath is missing in {mapDataPath}");
                return;
            }

            string imagePath = ResolveRelativePath(mapDataPath, mapData.imagePath);
            if (!File.Exists(imagePath))
            {
                Debug.LogError($"Sample map bootstrap failed: image not found at {imagePath}");
                return;
            }

            Transform level0Floor = FindTransformRecursive(transform.root, "Level_0_Floor");
            Transform groundPlane = FindTransformRecursive(transform.root, "GroundPlane");

            if (level0Floor == null)
            {
                Debug.LogError("Sample map bootstrap failed: Level_0_Floor was not found.");
                return;
            }

            if (groundPlane == null)
            {
                Debug.LogError("Sample map bootstrap failed: GroundPlane was not found.");
                return;
            }

            byte[] imageBytes = File.ReadAllBytes(imagePath);
            Texture2D texture = new Texture2D(2, 2, TextureFormat.RGBA32, false);

            if (!texture.LoadImage(imageBytes))
            {
                Debug.LogError($"Sample map bootstrap failed: could not load texture from {imagePath}");
                return;
            }

            float[,] elevationGrid = BuildElevationGrid(mapData);
            ApplyTextureToGroundPlane(groundPlane, texture, mapData.gridWidth, mapData.gridHeight);

            bool[,] blockedTiles = BuildBlockedTileGrid(texture, mapData.gridWidth, mapData.gridHeight);
            Transform blockerRoot = EnsureChildTransform(level0Floor, "ArcaneLibraryBlockers");
            ClearChildren(blockerRoot);
            GenerateBlockers(blockerRoot, blockedTiles, mapData.gridWidth, mapData.gridHeight);

            PlaceToken("Token_Floor", TokenFloorPreferredTile, blockedTiles, mapData.gridWidth, mapData.gridHeight);
            PlaceToken("Token_Catwalk", TokenCatwalkPreferredTile, blockedTiles, mapData.gridWidth, mapData.gridHeight);

            Debug.Log(
                $"Arcane Library sample map loaded: {texture.width}x{texture.height} px, " +
                $"{mapData.gridWidth}x{mapData.gridHeight} tiles, {CountBlockedTiles(blockedTiles, mapData.gridWidth, mapData.gridHeight)} blocked tiles, " +
                $"{CountDefinedHeights(elevationGrid, mapData.defaultHeightFt)} custom heights, " +
                $"{CountRampRegions(mapData)} ramps.");
        }

        private static void ApplyTextureToGroundPlane(Transform groundPlane, Texture2D texture, int gridWidth, int gridHeight)
        {
            Vector3 scale = new Vector3(gridWidth * TileSize, GroundThickness, gridHeight * TileSize);
            groundPlane.localScale = scale;
            groundPlane.localPosition = new Vector3(0f, -GroundThickness * 0.5f, 0f);

            Renderer renderer = groundPlane.GetComponent<Renderer>();
            if (renderer == null)
            {
                return;
            }

            Shader unlitShader = Shader.Find("Universal Render Pipeline/Unlit");
            if (unlitShader != null)
            {
                renderer.material = new Material(unlitShader);
            }

            Material material = renderer.material;
            material.mainTexture = texture;
            material.mainTextureOffset = Vector2.zero;
            material.mainTextureScale = new Vector2(-1f, -1f);
            renderer.receiveShadows = false;
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        }

        private static float[,] BuildElevationGrid(MapDataSource mapData)
        {
            float[,] elevationGrid = new float[mapData.gridWidth, mapData.gridHeight];

            for (int x = 0; x < mapData.gridWidth; x++)
            {
                for (int y = 0; y < mapData.gridHeight; y++)
                {
                    elevationGrid[x, y] = mapData.defaultHeightFt;
                }
            }

            if (mapData.rampRegions != null)
            {
                foreach (MapRampRegion rampRegion in mapData.rampRegions)
                {
                    ApplyRampRegion(elevationGrid, rampRegion, mapData.gridWidth, mapData.gridHeight);
                }
            }

            if (mapData.heightOverrides != null)
            {
                foreach (MapHeightOverride heightOverride in mapData.heightOverrides)
                {
                    if (heightOverride.x < 0
                        || heightOverride.x >= mapData.gridWidth
                        || heightOverride.y < 0
                        || heightOverride.y >= mapData.gridHeight)
                    {
                        continue;
                    }

                    elevationGrid[heightOverride.x, heightOverride.y] = heightOverride.heightFt;
                }
            }

            return elevationGrid;
        }

        private static void ApplyRampRegion(float[,] elevationGrid, MapRampRegion rampRegion, int gridWidth, int gridHeight)
        {
            if (rampRegion == null || rampRegion.bounds == null || rampRegion.lowEdge == null || rampRegion.highEdge == null)
            {
                return;
            }

            if (rampRegion.bounds.width <= 0 || rampRegion.bounds.height <= 0)
            {
                return;
            }

            if (!TryParseRampSide(rampRegion.lowEdge.side, out RampSide lowSide)
                || !TryParseRampSide(rampRegion.highEdge.side, out RampSide highSide))
            {
                Debug.LogWarning($"Sample map bootstrap: ramp '{rampRegion.id}' has invalid side values.");
                return;
            }

            bool horizontalRamp = IsHorizontalRamp(lowSide, highSide);
            bool verticalRamp = IsVerticalRamp(lowSide, highSide);

            if (!horizontalRamp && !verticalRamp)
            {
                Debug.LogWarning($"Sample map bootstrap: ramp '{rampRegion.id}' must connect opposite edges.");
                return;
            }

            for (int x = rampRegion.bounds.x; x < rampRegion.bounds.x + rampRegion.bounds.width; x++)
            {
                for (int y = rampRegion.bounds.y; y < rampRegion.bounds.y + rampRegion.bounds.height; y++)
                {
                    if (x < 0 || x >= gridWidth || y < 0 || y >= gridHeight)
                    {
                        continue;
                    }

                    float t = horizontalRamp
                        ? GetRampInterpolationFactor(x, rampRegion.bounds.x, rampRegion.bounds.width, lowSide, highSide)
                        : GetRampInterpolationFactor(y, rampRegion.bounds.y, rampRegion.bounds.height, lowSide, highSide);

                    elevationGrid[x, y] = Mathf.Lerp(rampRegion.lowEdge.heightFt, rampRegion.highEdge.heightFt, t);
                }
            }
        }

        private static bool TryParseRampSide(string side, out RampSide rampSide)
        {
            return Enum.TryParse(side, true, out rampSide);
        }

        private static bool IsHorizontalRamp(RampSide lowSide, RampSide highSide)
        {
            return (lowSide == RampSide.West && highSide == RampSide.East)
                || (lowSide == RampSide.East && highSide == RampSide.West);
        }

        private static bool IsVerticalRamp(RampSide lowSide, RampSide highSide)
        {
            return (lowSide == RampSide.South && highSide == RampSide.North)
                || (lowSide == RampSide.North && highSide == RampSide.South);
        }

        private static float GetRampInterpolationFactor(int coordinate, int start, int size, RampSide lowSide, RampSide highSide)
        {
            float normalized = ((coordinate - start) + 0.5f) / size;

            if (lowSide == RampSide.East || lowSide == RampSide.North)
            {
                return 1f - normalized;
            }

            return normalized;
        }

        private static bool[,] BuildBlockedTileGrid(Texture2D texture, int gridWidth, int gridHeight)
        {
            bool[,] blockedTiles = new bool[gridWidth, gridHeight];

            for (int x = 0; x < gridWidth; x++)
            {
                for (int y = 0; y < gridHeight; y++)
                {
                    blockedTiles[x, y] = IsTileBlocked(texture, x, y, gridWidth, gridHeight);
                }
            }

            return blockedTiles;
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
                    float u = GetTextureU(tileX, sampleX, samplesPerAxis, gridWidth);
                    float v = GetTextureV(tileY, sampleY, samplesPerAxis, gridHeight);
                    Color color = texture.GetPixelBilinear(u, v);
                    luminanceSum += color.r * 0.299f + color.g * 0.587f + color.b * 0.114f;
                    sampleCount++;
                }
            }

            float averageLuminance = luminanceSum / sampleCount;
            return averageLuminance <= BlockerThreshold;
        }

        private static void GenerateBlockers(Transform blockerRoot, bool[,] blockedTiles, int gridWidth, int gridHeight)
        {
            for (int x = 0; x < gridWidth; x++)
            {
                for (int y = 0; y < gridHeight; y++)
                {
                    if (!blockedTiles[x, y])
                    {
                        continue;
                    }

                    GameObject blocker = GameObject.CreatePrimitive(PrimitiveType.Cube);
                    blocker.name = $"ArcaneLibraryBlocker_{x}_{y}";
                    blocker.transform.SetParent(blockerRoot, false);
                    blocker.transform.localScale = new Vector3(TileSize, BlockerHeight, TileSize);
                    blocker.transform.localPosition = TileToWorldPosition(x, y, BlockerHeight * 0.5f, gridWidth, gridHeight);

                    MeshRenderer renderer = blocker.GetComponent<MeshRenderer>();
                    if (renderer != null)
                    {
                        renderer.enabled = false;
                    }

                    TacticalCollider tacticalCollider = blocker.GetComponent<TacticalCollider>();
                    if (tacticalCollider == null)
                    {
                        tacticalCollider = blocker.AddComponent<TacticalCollider>();
                    }

                    tacticalCollider.BlocksMovement = true;
                    tacticalCollider.BlocksLineOfSight = true;
                    tacticalCollider.ProvidesCover = false;
                    tacticalCollider.CoverType = CoverType.None;
                }
            }
        }

        private static void PlaceToken(string tokenName, Vector2Int preferredTile, bool[,] blockedTiles, int gridWidth, int gridHeight)
        {
            Transform tokenTransform = GameObject.Find(tokenName)?.transform;

            if (tokenTransform == null)
            {
                Debug.LogWarning($"Sample map bootstrap: token '{tokenName}' was not found.");
                return;
            }

            Vector2Int tile = FindNearestOpenTile(preferredTile, blockedTiles, gridWidth, gridHeight);
            tokenTransform.localPosition = TileToWorldPosition(tile.x, tile.y, TokenY, gridWidth, gridHeight);
        }

        private static Vector2Int FindNearestOpenTile(Vector2Int preferredTile, bool[,] blockedTiles, int gridWidth, int gridHeight)
        {
            preferredTile.x = Mathf.Clamp(preferredTile.x, 0, gridWidth - 1);
            preferredTile.y = Mathf.Clamp(preferredTile.y, 0, gridHeight - 1);

            if (!blockedTiles[preferredTile.x, preferredTile.y])
            {
                return preferredTile;
            }

            bool[,] visited = new bool[gridWidth, gridHeight];
            Queue<Vector2Int> queue = new();
            queue.Enqueue(preferredTile);
            visited[preferredTile.x, preferredTile.y] = true;

            Vector2Int[] directions =
            {
                new(1, 0),
                new(-1, 0),
                new(0, 1),
                new(0, -1)
            };

            while (queue.Count > 0)
            {
                Vector2Int current = queue.Dequeue();

                foreach (Vector2Int direction in directions)
                {
                    Vector2Int next = current + direction;
                    if (next.x < 0 || next.x >= gridWidth || next.y < 0 || next.y >= gridHeight)
                    {
                        continue;
                    }

                    if (visited[next.x, next.y])
                    {
                        continue;
                    }

                    if (!blockedTiles[next.x, next.y])
                    {
                        return next;
                    }

                    visited[next.x, next.y] = true;
                    queue.Enqueue(next);
                }
            }

            return preferredTile;
        }

        private static Vector3 TileToWorldPosition(int tileX, int tileY, float y, int gridWidth, int gridHeight)
        {
            float worldX = tileX - (gridWidth * 0.5f) + 0.5f;
            float worldZ = tileY - (gridHeight * 0.5f) + 0.5f;
            return new Vector3(worldX, y, worldZ);
        }

        private static float GetTextureU(int tileX, int sampleX, int samplesPerAxis, int gridWidth)
        {
            return (tileX + (sampleX + 0.5f) / samplesPerAxis) / gridWidth;
        }

        private static float GetTextureV(int tileY, int sampleY, int samplesPerAxis, int gridHeight)
        {
            return (tileY + (sampleY + 0.5f) / samplesPerAxis) / gridHeight;
        }

        private static int CountBlockedTiles(bool[,] blockedTiles, int gridWidth, int gridHeight)
        {
            int blockedCount = 0;

            for (int x = 0; x < gridWidth; x++)
            {
                for (int y = 0; y < gridHeight; y++)
                {
                    if (blockedTiles[x, y])
                    {
                        blockedCount++;
                    }
                }
            }

            return blockedCount;
        }

        private static int CountDefinedHeights(float[,] elevationGrid, float defaultHeightFt)
        {
            int count = 0;
            int gridWidth = elevationGrid.GetLength(0);
            int gridHeight = elevationGrid.GetLength(1);

            for (int x = 0; x < gridWidth; x++)
            {
                for (int y = 0; y < gridHeight; y++)
                {
                    if (!Mathf.Approximately(elevationGrid[x, y], defaultHeightFt))
                    {
                        count++;
                    }
                }
            }

            return count;
        }

        private static int CountRampRegions(MapDataSource mapData)
        {
            return mapData.rampRegions == null ? 0 : mapData.rampRegions.Count;
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

        private static Transform FindTransformRecursive(Transform root, string targetName)
        {
            if (root == null)
            {
                return null;
            }

            if (root.name == targetName)
            {
                return root;
            }

            foreach (Transform child in root)
            {
                Transform found = FindTransformRecursive(child, targetName);
                if (found != null)
                {
                    return found;
                }
            }

            return null;
        }

        private static Transform EnsureChildTransform(Transform parent, string childName)
        {
            Transform existing = parent.Find(childName);
            if (existing != null)
            {
                return existing;
            }

            GameObject child = new GameObject(childName);
            child.transform.SetParent(parent, false);
            return child.transform;
        }

        private static void ClearChildren(Transform parent)
        {
            for (int index = parent.childCount - 1; index >= 0; index--)
            {
                Transform child = parent.GetChild(index);

                if (Application.isPlaying)
                {
                    UnityEngine.Object.Destroy(child.gameObject);
                }
                else
                {
                    UnityEngine.Object.DestroyImmediate(child.gameObject);
                }
            }
        }
    }

    [Serializable]
    public sealed class MapDataSource
    {
        public int version;
        public string imagePath;
        public int gridWidth;
        public int gridHeight;
        public float squareSizeFt;
        public float defaultHeightFt;
        public List<MapHeightOverride> heightOverrides;
        public List<MapRampRegion> rampRegions;
    }

    [Serializable]
    public sealed class MapHeightOverride
    {
        public int x;
        public int y;
        public float heightFt;
    }

    [Serializable]
    public sealed class MapRampRegion
    {
        public string id;
        public MapRectInt bounds;
        public MapRampEdge lowEdge;
        public MapRampEdge highEdge;
    }

    [Serializable]
    public sealed class MapRectInt
    {
        public int x;
        public int y;
        public int width;
        public int height;
    }

    [Serializable]
    public sealed class MapRampEdge
    {
        public string side;
        public float heightFt;
    }

    public enum RampSide
    {
        West,
        East,
        South,
        North
    }
}
