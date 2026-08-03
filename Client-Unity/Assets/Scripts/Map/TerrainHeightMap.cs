using UnityEngine;

namespace Roll4InitiativeVTT.Map
{
    public static class TerrainHeightMap
    {
        private static float[,] elevationGrid;
        private static int gridWidth;
        private static int gridHeight;
        private static float squareSizeFt;
        private static float defaultHeightFt;

        public static void Configure(float[,] newElevationGrid, int newGridWidth, int newGridHeight, float newSquareSizeFt, float newDefaultHeightFt)
        {
            elevationGrid = newElevationGrid;
            gridWidth = newGridWidth;
            gridHeight = newGridHeight;
            squareSizeFt = newSquareSizeFt;
            defaultHeightFt = newDefaultHeightFt;
        }

        public static bool TryGetHeightWorldAtWorldPoint(Vector3 worldPoint, out float heightWorld)
        {
            heightWorld = 0f;

            if (elevationGrid == null || gridWidth <= 0 || gridHeight <= 0)
            {
                return false;
            }

            float gridX = worldPoint.x + gridWidth * 0.5f;
            float gridY = worldPoint.z + gridHeight * 0.5f;

            int tileX = Mathf.FloorToInt(gridX);
            int tileY = Mathf.FloorToInt(gridY);

            if (tileX < 0 || tileX >= gridWidth || tileY < 0 || tileY >= gridHeight)
            {
                return false;
            }

            float heightFeet = elevationGrid[tileX, tileY];
            heightWorld = GetWorldHeight(heightFeet);
            return true;
        }

        public static float GetDefaultHeightWorld()
        {
            return GetWorldHeight(defaultHeightFt);
        }

        private static float GetWorldHeight(float heightFeet)
        {
            if (squareSizeFt <= 0f)
            {
                return heightFeet;
            }

            return heightFeet / squareSizeFt;
        }
    }
}
