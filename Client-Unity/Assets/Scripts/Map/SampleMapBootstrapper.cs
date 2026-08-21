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
            TerrainHeightMap.Configure(elevationGrid, mapData.gridWidth, mapData.gridHeight, mapData.squareSizeFt, mapData.defaultHeightFt);
            Transform surfaceRoot = EnsureChildTransform(level0Floor, "ArcaneLibrarySurface");
            ClearChildren(surfaceRoot);
            GenerateTileSurfaces(
                surfaceRoot,
                texture,
                mapData.sideWallColor,
                mapData);
            groundPlane.gameObject.SetActive(false);

            bool[,] blockedTiles = BuildBlockedTileGrid(mapData);
            TacticalMapRuntime.Configure(
                elevationGrid,
                blockedTiles,
                mapData.gridWidth,
                mapData.gridHeight,
                mapData.squareSizeFt,
                mapData.defaultHeightFt);
            Transform blockerRoot = EnsureChildTransform(level0Floor, "ArcaneLibraryBlockers");
            ClearChildren(blockerRoot);
            GenerateBlockers(blockerRoot, blockedTiles, elevationGrid, mapData.gridWidth, mapData.gridHeight, mapData.squareSizeFt, mapData.defaultHeightFt);

            PlaceToken("Token_Floor", TokenFloorPreferredTile, blockedTiles, elevationGrid, mapData.gridWidth, mapData.gridHeight, mapData.squareSizeFt, mapData.defaultHeightFt);
            PlaceToken("Token_Catwalk", TokenCatwalkPreferredTile, blockedTiles, elevationGrid, mapData.gridWidth, mapData.gridHeight, mapData.squareSizeFt, mapData.defaultHeightFt);

            Debug.Log(
                $"Arcane Library sample map loaded: {texture.width}x{texture.height} px, " +
                $"{mapData.gridWidth}x{mapData.gridHeight} tiles, {CountBlockedTiles(blockedTiles, mapData.gridWidth, mapData.gridHeight)} blocked tiles, " +
                $"{CountDefinedHeights(elevationGrid, mapData.defaultHeightFt)} custom heights, manual height steps only.");
        }

        private static void GenerateTileSurfaces(
            Transform surfaceRoot,
            Texture2D texture,
            MapColor sideWallColor,
            MapDataSource mapData)
        {
            if (surfaceRoot == null)
            {
                return;
            }

            Material topMaterial = CreateTopSurfaceMaterial(texture);
            Material sideMaterial = CreateSideSurfaceMaterial(sideWallColor);

            for (int x = 0; x < mapData.gridWidth; x++)
            {
                for (int y = 0; y < mapData.gridHeight; y++)
                {
                    GameObject tile = new GameObject($"ArcaneLibraryTile_{x}_{y}");
                    tile.transform.SetParent(surfaceRoot, false);
                    tile.transform.localPosition = TileToWorldPosition(x, y, 0f, mapData.gridWidth, mapData.gridHeight);

                    MeshFilter meshFilter = tile.AddComponent<MeshFilter>();
                    MeshRenderer meshRenderer = tile.AddComponent<MeshRenderer>();
                    meshFilter.sharedMesh = CreateTileMesh(x, y, mapData);
                    meshRenderer.sharedMaterials = new[] { topMaterial, sideMaterial };
                }
            }
        }

        private static Material CreateTopSurfaceMaterial(Texture2D texture)
        {
            Material material = CreateMaterial("Universal Render Pipeline/Unlit", "Unlit/Texture", "Standard");
            material.mainTexture = texture;
            material.mainTextureOffset = Vector2.zero;
            material.mainTextureScale = Vector2.one;
            return material;
        }

        private static Material CreateSideSurfaceMaterial(MapColor mapDataSideWallColor)
        {
            Material material = CreateMaterial("Universal Render Pipeline/Unlit", "Unlit/Color", "Standard");
            material.color = mapDataSideWallColor == null
                ? Color.black
                : new Color(mapDataSideWallColor.r, mapDataSideWallColor.g, mapDataSideWallColor.b, mapDataSideWallColor.a);
            material.SetInt("_Cull", (int)UnityEngine.Rendering.CullMode.Off);
            return material;
        }

        private static Material CreateMaterial(params string[] shaderNames)
        {
            foreach (string shaderName in shaderNames)
            {
                Shader shader = Shader.Find(shaderName);
                if (shader != null)
                {
                    return new Material(shader);
                }
            }

            Shader fallbackShader = Shader.Find("Hidden/InternalErrorShader");
            return new Material(fallbackShader);
        }

        private static float[,] BuildElevationGrid(MapDataSource mapData)
        {
            float[,] elevationGrid = new float[mapData.gridWidth, mapData.gridHeight];

            for (int x = 0; x < mapData.gridWidth; x++)
            {
                for (int y = 0; y < mapData.gridHeight; y++)
                {
                    float pointX = x + 0.5f;
                    float pointY = y + 0.5f;
                    elevationGrid[x, y] = GetMapHeightFeetAtPoint(mapData, pointX, pointY);
                }
            }

            return elevationGrid;
        }

        private static void ApplyHeightOverride(float[,] elevationGrid, MapHeightOverride heightOverride, int gridWidth, int gridHeight)
        {
            if (heightOverride == null)
            {
                return;
            }

            int width = heightOverride.width <= 0 ? 1 : heightOverride.width;
            int height = heightOverride.height <= 0 ? 1 : heightOverride.height;

            for (int x = heightOverride.x; x < heightOverride.x + width; x++)
            {
                for (int y = heightOverride.y; y < heightOverride.y + height; y++)
                {
                    if (x < 0 || x >= gridWidth || y < 0 || y >= gridHeight)
                    {
                        continue;
                    }

                    elevationGrid[x, y] = heightOverride.heightFt;
                }
            }
        }

        private static bool[,] BuildBlockedTileGrid(MapDataSource mapData)
        {
            bool[,] blockedTiles = new bool[mapData.gridWidth, mapData.gridHeight];

            if (mapData.blockedTiles == null)
            {
                return blockedTiles;
            }

            foreach (MapPoint blockedTile in mapData.blockedTiles)
            {
                if (blockedTile == null)
                {
                    continue;
                }

                if (blockedTile.x < 0 || blockedTile.x >= mapData.gridWidth || blockedTile.y < 0 || blockedTile.y >= mapData.gridHeight)
                {
                    continue;
                }

                blockedTiles[blockedTile.x, blockedTile.y] = true;
            }

            return blockedTiles;
        }

        private static void GenerateBlockers(
            Transform blockerRoot,
            bool[,] blockedTiles,
            float[,] elevationGrid,
            int gridWidth,
            int gridHeight,
            float squareSizeFt,
            float defaultHeightFt)
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
                    float surfaceY = GetTileWorldHeight(elevationGrid[x, y], squareSizeFt);
                    blocker.transform.localPosition = TileToWorldPosition(x, y, surfaceY + BlockerHeight * 0.5f, gridWidth, gridHeight);

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

        private static void PlaceToken(
            string tokenName,
            Vector2Int preferredTile,
            bool[,] blockedTiles,
            float[,] elevationGrid,
            int gridWidth,
            int gridHeight,
            float squareSizeFt,
            float defaultHeightFt)
        {
            Transform tokenTransform = GameObject.Find(tokenName)?.transform;

            if (tokenTransform == null)
            {
                Debug.LogWarning($"Sample map bootstrap: token '{tokenName}' was not found.");
                return;
            }

            Vector2Int tile = FindNearestOpenTile(preferredTile, blockedTiles, gridWidth, gridHeight);
            float surfaceY = GetTileWorldHeight(elevationGrid[tile.x, tile.y], squareSizeFt);
            tokenTransform.localPosition = TileToWorldPosition(tile.x, tile.y, surfaceY + TokenY, gridWidth, gridHeight);
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

        private static float GetTileWorldHeight(float heightFeet, float squareSizeFeet)
        {
            if (squareSizeFeet <= 0f)
            {
                return heightFeet;
            }

            return heightFeet / squareSizeFeet * TileSize;
        }

        private static float[] GetTileCornerHeights(int tileX, int tileY, MapDataSource mapData)
        {
            float centerHeight = GetMapHeightFeetAtPoint(mapData, tileX + 0.5f, tileY + 0.5f);
            float centerWorldHeight = GetTileWorldHeight(centerHeight, mapData.squareSizeFt);
            return new[]
            {
                centerWorldHeight,
                centerWorldHeight,
                centerWorldHeight,
                centerWorldHeight
            };
        }

        private static Mesh CreateTileMesh(int tileX, int tileY, MapDataSource mapData)
        {
            float[] cornerHeights = GetTileCornerHeights(tileX, tileY, mapData);

            List<Vector3> vertices = new();
            List<Vector2> uvs = new();
            List<int> topTriangles = new();
            List<int> sideTriangles = new();

            float uMin = (float)tileX / mapData.gridWidth;
            float uMax = (float)(tileX + 1) / mapData.gridWidth;
            float vMin = (float)tileY / mapData.gridHeight;
            float vMax = (float)(tileY + 1) / mapData.gridHeight;

            AddTopFace(vertices, uvs, topTriangles, cornerHeights, uMin, uMax, vMin, vMax);

            float[] westNeighbor = GetTileCornerHeights(tileX - 1, tileY, mapData);
            float[] eastNeighbor = GetTileCornerHeights(tileX + 1, tileY, mapData);
            float[] southNeighbor = GetTileCornerHeights(tileX, tileY - 1, mapData);
            float[] northNeighbor = GetTileCornerHeights(tileX, tileY + 1, mapData);

            AddWestWall(vertices, uvs, sideTriangles, cornerHeights, westNeighbor);
            AddEastWall(vertices, uvs, sideTriangles, cornerHeights, eastNeighbor);
            AddSouthWall(vertices, uvs, sideTriangles, cornerHeights, southNeighbor);
            AddNorthWall(vertices, uvs, sideTriangles, cornerHeights, northNeighbor);

            Mesh mesh = new Mesh
            {
                name = $"ArcaneLibraryTileMesh_{tileX}_{tileY}"
            };
            mesh.SetVertices(vertices);
            mesh.SetUVs(0, uvs);
            mesh.subMeshCount = 2;
            mesh.SetTriangles(topTriangles, 0);
            mesh.SetTriangles(sideTriangles, 1);
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            return mesh;
        }

        private static void AddTopFace(
            List<Vector3> vertices,
            List<Vector2> uvs,
            List<int> triangles,
            float[] cornerHeights,
            float uMin,
            float uMax,
            float vMin,
            float vMax)
        {
            int startIndex = vertices.Count;
            vertices.Add(new Vector3(-0.5f, cornerHeights[0], -0.5f));
            vertices.Add(new Vector3(0.5f, cornerHeights[1], -0.5f));
            vertices.Add(new Vector3(-0.5f, cornerHeights[2], 0.5f));
            vertices.Add(new Vector3(0.5f, cornerHeights[3], 0.5f));

            uvs.Add(new Vector2(uMin, vMin));
            uvs.Add(new Vector2(uMax, vMin));
            uvs.Add(new Vector2(uMin, vMax));
            uvs.Add(new Vector2(uMax, vMax));

            triangles.Add(startIndex + 0);
            triangles.Add(startIndex + 2);
            triangles.Add(startIndex + 1);
            triangles.Add(startIndex + 2);
            triangles.Add(startIndex + 3);
            triangles.Add(startIndex + 1);

            triangles.Add(startIndex + 0);
            triangles.Add(startIndex + 1);
            triangles.Add(startIndex + 2);
            triangles.Add(startIndex + 2);
            triangles.Add(startIndex + 1);
            triangles.Add(startIndex + 3);
        }

        private static void AddWestWall(List<Vector3> vertices, List<Vector2> uvs, List<int> triangles, float[] cornerHeights, float[] neighborCornerHeights)
        {
            AddWallIfNeeded(
                vertices,
                uvs,
                triangles,
                new Vector3(-0.5f, cornerHeights[0], -0.5f),
                new Vector3(-0.5f, cornerHeights[2], 0.5f),
                new Vector3(-0.5f, neighborCornerHeights[1], -0.5f),
                new Vector3(-0.5f, neighborCornerHeights[3], 0.5f));
        }

        private static void AddEastWall(List<Vector3> vertices, List<Vector2> uvs, List<int> triangles, float[] cornerHeights, float[] neighborCornerHeights)
        {
            AddWallIfNeeded(
                vertices,
                uvs,
                triangles,
                new Vector3(0.5f, cornerHeights[1], -0.5f),
                new Vector3(0.5f, cornerHeights[3], 0.5f),
                new Vector3(0.5f, neighborCornerHeights[0], -0.5f),
                new Vector3(0.5f, neighborCornerHeights[2], 0.5f));
        }

        private static void AddSouthWall(List<Vector3> vertices, List<Vector2> uvs, List<int> triangles, float[] cornerHeights, float[] neighborCornerHeights)
        {
            AddWallIfNeeded(
                vertices,
                uvs,
                triangles,
                new Vector3(-0.5f, cornerHeights[0], -0.5f),
                new Vector3(0.5f, cornerHeights[1], -0.5f),
                new Vector3(-0.5f, neighborCornerHeights[2], -0.5f),
                new Vector3(0.5f, neighborCornerHeights[3], -0.5f));
        }

        private static void AddNorthWall(List<Vector3> vertices, List<Vector2> uvs, List<int> triangles, float[] cornerHeights, float[] neighborCornerHeights)
        {
            AddWallIfNeeded(
                vertices,
                uvs,
                triangles,
                new Vector3(-0.5f, cornerHeights[2], 0.5f),
                new Vector3(0.5f, cornerHeights[3], 0.5f),
                new Vector3(-0.5f, neighborCornerHeights[0], 0.5f),
                new Vector3(0.5f, neighborCornerHeights[1], 0.5f));
        }

        private static void AddWallIfNeeded(
            List<Vector3> vertices,
            List<Vector2> uvs,
            List<int> triangles,
            Vector3 topStart,
            Vector3 topEnd,
            Vector3 bottomStart,
            Vector3 bottomEnd)
        {
            if (topStart.y <= bottomStart.y + 0.0001f && topEnd.y <= bottomEnd.y + 0.0001f)
            {
                return;
            }

            int startIndex = vertices.Count;
            vertices.Add(topStart);
            vertices.Add(topEnd);
            vertices.Add(bottomStart);
            vertices.Add(bottomEnd);

            uvs.Add(new Vector2(0f, 1f));
            uvs.Add(new Vector2(1f, 1f));
            uvs.Add(new Vector2(0f, 0f));
            uvs.Add(new Vector2(1f, 0f));

            triangles.Add(startIndex + 0);
            triangles.Add(startIndex + 2);
            triangles.Add(startIndex + 1);
            triangles.Add(startIndex + 2);
            triangles.Add(startIndex + 3);
            triangles.Add(startIndex + 1);
        }

        private static float GetMapHeightFeetAtPoint(MapDataSource mapData, float pointX, float pointY)
        {
            if (mapData == null)
            {
                return 0f;
            }

            if (TryGetHeightOverrideFeetAtPoint(mapData.heightOverrides, pointX, pointY, out float overrideHeightFt))
            {
                return overrideHeightFt;
            }

            return mapData.defaultHeightFt;
        }

        private static bool TryGetHeightOverrideFeetAtPoint(List<MapHeightOverride> heightOverrides, float pointX, float pointY, out float heightFt)
        {
            if (heightOverrides != null)
            {
                foreach (MapHeightOverride candidate in heightOverrides)
                {
                    if (candidate == null)
                    {
                        continue;
                    }

                    int width = candidate.width <= 0 ? 1 : candidate.width;
                    int height = candidate.height <= 0 ? 1 : candidate.height;

                    if (pointX >= candidate.x
                        && pointX < candidate.x + width
                        && pointY >= candidate.y
                        && pointY < candidate.y + height)
                    {
                        heightFt = candidate.heightFt;
                        return true;
                    }
                }
            }

            heightFt = 0f;
            return false;
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
        public MapColor sideWallColor;
        public List<MapHeightOverride> heightOverrides;
        public List<MapPoint> blockedTiles;
    }

    [Serializable]
    public sealed class MapColor
    {
        public float r;
        public float g;
        public float b;
        public float a = 1f;
    }

    [Serializable]
    public sealed class MapHeightOverride
    {
        public int x;
        public int y;
        public int width;
        public int height;
        public float heightFt;
    }

    [Serializable]
    public sealed class MapPoint
    {
        public int x;
        public int y;
    }

}
