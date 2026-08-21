using UnityEngine;

namespace Roll4InitiativeVTT.Map
{
    public static class TacticalMapRuntime
    {
        private static bool[,] blockedTiles;
        private static float[,] elevationGrid;
        private static int gridWidth;
        private static int gridHeight;
        private static float squareSizeFt;
        private static float defaultHeightFt;

        public static void Configure(
            float[,] newElevationGrid,
            bool[,] newBlockedTiles,
            int newGridWidth,
            int newGridHeight,
            float newSquareSizeFt,
            float newDefaultHeightFt)
        {
            elevationGrid = newElevationGrid;
            blockedTiles = newBlockedTiles;
            gridWidth = newGridWidth;
            gridHeight = newGridHeight;
            squareSizeFt = newSquareSizeFt;
            defaultHeightFt = newDefaultHeightFt;
        }

        public static bool IsReady()
        {
            return blockedTiles != null && elevationGrid != null && gridWidth > 0 && gridHeight > 0;
        }

        public static bool IsBlocked(int squareX, int squareY)
        {
            if (!IsReady())
            {
                return false;
            }

            if (squareX < 0 || squareX >= gridWidth || squareY < 0 || squareY >= gridHeight)
            {
                return true;
            }

            return blockedTiles[squareX, squareY];
        }

        public static bool TryGetSquareHeightFeet(int squareX, int squareY, out float heightFeet)
        {
            heightFeet = defaultHeightFt;

            if (!IsReady())
            {
                return false;
            }

            if (squareX < 0 || squareX >= gridWidth || squareY < 0 || squareY >= gridHeight)
            {
                return false;
            }

            heightFeet = elevationGrid[squareX, squareY];
            return true;
        }

        public static float GetSquareHeightWorld(int squareX, int squareY)
        {
            if (!TryGetSquareHeightFeet(squareX, squareY, out float heightFeet))
            {
                return GetWorldHeight(defaultHeightFt);
            }

            return GetWorldHeight(heightFeet);
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
