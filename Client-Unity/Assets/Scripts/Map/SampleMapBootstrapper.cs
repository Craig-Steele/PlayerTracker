using System.Collections.Generic;
using System.IO;
using Roll4InitiativeVTT.Tokens;
using UnityEngine;

namespace Roll4InitiativeVTT.Map
{
    public sealed class SampleMapBootstrapper : MonoBehaviour
    {
        private const string SampleMapRelativePath = "../../Images/Arcane Library PZO30084E.png";
        private const int GridWidth = 24;
        private const int GridHeight = 30;
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

            string imagePath = Path.GetFullPath(Path.Combine(Application.dataPath, SampleMapRelativePath));

            if (!File.Exists(imagePath))
            {
                Debug.LogError($"Sample map bootstrap failed: image not found at {imagePath}");
                return;
            }

            byte[] imageBytes = File.ReadAllBytes(imagePath);
            Texture2D texture = new Texture2D(2, 2, TextureFormat.RGBA32, false);

            if (!texture.LoadImage(imageBytes))
            {
                Debug.LogError($"Sample map bootstrap failed: could not load texture from {imagePath}");
                return;
            }

            ApplyTextureToGroundPlane(groundPlane, texture);

            bool[,] blockedTiles = BuildBlockedTileGrid(texture);
            Transform blockerRoot = EnsureChildTransform(level0Floor, "ArcaneLibraryBlockers");
            ClearChildren(blockerRoot);
            GenerateBlockers(blockerRoot, blockedTiles);

            PlaceToken("Token_Floor", TokenFloorPreferredTile, blockedTiles);
            PlaceToken("Token_Catwalk", TokenCatwalkPreferredTile, blockedTiles);

            Debug.Log(
                $"Arcane Library sample map loaded: {texture.width}x{texture.height} px, " +
                $"{GridWidth}x{GridHeight} tiles, {CountBlockedTiles(blockedTiles)} blocked tiles.");
        }

        private static void ApplyTextureToGroundPlane(Transform groundPlane, Texture2D texture)
        {
            Vector3 scale = new Vector3(GridWidth * TileSize, GroundThickness, GridHeight * TileSize);
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
            material.mainTextureScale = Vector2.one;
            renderer.receiveShadows = false;
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        }

        private static bool[,] BuildBlockedTileGrid(Texture2D texture)
        {
            bool[,] blockedTiles = new bool[GridWidth, GridHeight];

            for (int x = 0; x < GridWidth; x++)
            {
                for (int y = 0; y < GridHeight; y++)
                {
                    blockedTiles[x, y] = IsTileBlocked(texture, x, y);
                }
            }

            return blockedTiles;
        }

        private static bool IsTileBlocked(Texture2D texture, int tileX, int tileY)
        {
            const int samplesPerAxis = 5;

            float luminanceSum = 0f;
            int sampleCount = 0;

            for (int sampleX = 0; sampleX < samplesPerAxis; sampleX++)
            {
                for (int sampleY = 0; sampleY < samplesPerAxis; sampleY++)
                {
                    float u = GetTextureU(tileX, sampleX, samplesPerAxis);
                    float v = GetTextureV(tileY, sampleY, samplesPerAxis);
                    Color color = texture.GetPixelBilinear(u, v);
                    luminanceSum += color.r * 0.299f + color.g * 0.587f + color.b * 0.114f;
                    sampleCount++;
                }
            }

            float averageLuminance = luminanceSum / sampleCount;
            return averageLuminance <= BlockerThreshold;
        }

        private static void GenerateBlockers(Transform blockerRoot, bool[,] blockedTiles)
        {
            for (int x = 0; x < GridWidth; x++)
            {
                for (int y = 0; y < GridHeight; y++)
                {
                    if (!blockedTiles[x, y])
                    {
                        continue;
                    }

                    GameObject blocker = GameObject.CreatePrimitive(PrimitiveType.Cube);
                    blocker.name = $"ArcaneLibraryBlocker_{x}_{y}";
                    blocker.transform.SetParent(blockerRoot, false);
                    blocker.transform.localScale = new Vector3(TileSize, BlockerHeight, TileSize);
                    blocker.transform.localPosition = TileToWorldPosition(x, y, BlockerHeight * 0.5f);

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

        private static void PlaceToken(string tokenName, Vector2Int preferredTile, bool[,] blockedTiles)
        {
            Transform tokenTransform = GameObject.Find(tokenName)?.transform;

            if (tokenTransform == null)
            {
                Debug.LogWarning($"Sample map bootstrap: token '{tokenName}' was not found.");
                return;
            }

            Vector2Int tile = FindNearestOpenTile(preferredTile, blockedTiles);
            tokenTransform.localPosition = TileToWorldPosition(tile.x, tile.y, TokenY);
        }

        private static Vector2Int FindNearestOpenTile(Vector2Int preferredTile, bool[,] blockedTiles)
        {
            preferredTile.x = Mathf.Clamp(preferredTile.x, 0, GridWidth - 1);
            preferredTile.y = Mathf.Clamp(preferredTile.y, 0, GridHeight - 1);

            if (!blockedTiles[preferredTile.x, preferredTile.y])
            {
                return preferredTile;
            }

            bool[,] visited = new bool[GridWidth, GridHeight];
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
                    if (next.x < 0 || next.x >= GridWidth || next.y < 0 || next.y >= GridHeight)
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

        private static Vector3 TileToWorldPosition(int tileX, int tileY, float y)
        {
            float worldX = tileX - (GridWidth * 0.5f) + 0.5f;
            float worldZ = tileY - (GridHeight * 0.5f) + 0.5f;
            return new Vector3(worldX, y, worldZ);
        }

        private static float GetTextureU(int tileX, int sampleX, int samplesPerAxis)
        {
            float u = (tileX + (sampleX + 0.5f) / samplesPerAxis) / GridWidth;
            return u;
        }

        private static float GetTextureV(int tileY, int sampleY, int samplesPerAxis)
        {
            float v = (tileY + (sampleY + 0.5f) / samplesPerAxis) / GridHeight;
            return v;
        }

        private static int CountBlockedTiles(bool[,] blockedTiles)
        {
            int blockedCount = 0;

            for (int x = 0; x < GridWidth; x++)
            {
                for (int y = 0; y < GridHeight; y++)
                {
                    if (blockedTiles[x, y])
                    {
                        blockedCount++;
                    }
                }
            }

            return blockedCount;
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
                    Object.Destroy(child.gameObject);
                }
                else
                {
                    Object.DestroyImmediate(child.gameObject);
                }
            }
        }
    }
}
