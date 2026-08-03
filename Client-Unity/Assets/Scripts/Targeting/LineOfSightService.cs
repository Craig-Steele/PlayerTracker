using System;
using Roll4InitiativeVTT.Map;
using Roll4InitiativeVTT.Tokens;
using UnityEngine;

namespace Roll4InitiativeVTT.Targeting
{
    public sealed class LineOfSightService : MonoBehaviour
    {
        [Header("Physics")]
        [SerializeField] private LayerMask obstructionMask = ~0;

        [Header("Debug Test")]
        [SerializeField] private TokenView attacker;
        [SerializeField] private TokenView target;
        [SerializeField] private bool drawDebugRay = true;
        [SerializeField] private bool logDebugContext = true;

        private const float TerrainSampleSpacing = 0.1f;
        private const float TerrainClearanceEpsilon = 0.02f;

        public bool HasLineOfSight(TokenView source, TokenView destination)
        {
            return BuildAttackContext(source, destination).HasLineOfSight;
        }

        public AttackContext BuildAttackContext(TokenView source, TokenView destination)
        {
            AttackContext context = new AttackContext(source, destination);

            if (source == null || destination == null)
            {
                Debug.LogWarning("Attack context failed: source or destination token is null.");
                context.HasLineOfSight = false;
                return context;
            }

            Vector3 from = source.EyePosition;
            Vector3 to = destination.CenterPosition;
            Vector3 delta = to - from;

            Vector3 horizontalDelta = new Vector3(delta.x, 0f, delta.z);

            context.HorizontalDistance = horizontalDelta.magnitude;
            context.VerticalDistance = Mathf.Abs(delta.y);
            context.TrueDistance = delta.magnitude;

            Vector3[] samplePoints = destination.GetTargetSamplePoints(from);

            foreach (Vector3 samplePoint in samplePoints)
            {
                TargetingRayResult rayResult = CastTargetingRay(source, destination, from, samplePoint);
                context.RayResults.Add(rayResult);
            }

            context.HasLineOfSight = context.ClearRayCount > 0;
            context.CoverType = DetermineCoverType(context.ClearRayCount, context.TotalRayCount);

            TargetingRayResult firstBlockedRay = null;

            foreach (TargetingRayResult rayResult in context.RayResults)
            {
                if (!rayResult.ReachedTarget)
                {
                    firstBlockedRay = rayResult;
                    break;
                }
            }

            if (firstBlockedRay != null)
            {
                context.HitObject = firstBlockedRay.HitObject;
                context.HitTacticalCollider = firstBlockedRay.HitTacticalCollider;
            }
            else if (context.RayResults.Count > 0)
            {
                context.HitObject = context.RayResults[0].HitObject;
                context.HitTacticalCollider = context.RayResults[0].HitTacticalCollider;
            }

            return context;
        }

        private void Update()
        {
            if (attacker == null || target == null)
            {
                return;
            }

            AttackContext context = BuildAttackContext(attacker, target);

            if (drawDebugRay)
            {
                DrawTargetingRays(context);            
            }

            if (logDebugContext)
            {
                Debug.Log(context.ToString());
            }
        }

        [ContextMenu("Test Attack Context")]
        private void TestAttackContext()
        {
            AttackContext context = BuildAttackContext(attacker, target);
            Debug.Log(context.ToString());
        }

        private TargetingRayResult CastTargetingRay(
            TokenView source,
            TokenView destination,
            Vector3 from,
            Vector3 to)
        {
            TargetingRayResult result = new TargetingRayResult
            {
                From = from,
                To = to
            };

            Vector3 delta = to - from;
            float distance = delta.magnitude;

            bool terrainBlocks = TryGetTerrainBlockDistance(from, to, out float terrainBlockDistance);

            if (distance <= 0.001f)
            {
                result.ReachedTarget = true;
                return result;
            }

            RaycastHit[] hits = Physics.RaycastAll(from, delta.normalized, distance, obstructionMask);

            if (hits.Length > 0)
            {
                Array.Sort(hits, (left, right) => left.distance.CompareTo(right.distance));

                foreach (RaycastHit hit in hits)
                {
                    if (terrainBlocks && terrainBlockDistance <= hit.distance)
                    {
                        result.ReachedTarget = false;
                        result.HitObject = null;
                        result.HitTacticalCollider = null;
                        result.CoverType = CoverType.Total;
                        return result;
                    }

                    if (hit.collider == null)
                    {
                        continue;
                    }

                    result.HitObject = hit.collider.gameObject;

                    TokenView hitToken = hit.collider.GetComponentInParent<TokenView>();

                    if (hitToken == source)
                    {
                        continue;
                    }

                    if (hitToken == destination)
                    {
                        result.ReachedTarget = true;
                        return result;
                    }

                    TacticalCollider tacticalCollider = hit.collider.GetComponent<TacticalCollider>();

                    if (tacticalCollider == null)
                    {
                        result.ReachedTarget = false;
                        result.HitTacticalCollider = null;
                        result.CoverType = CoverType.Total;
                        return result;
                    }

                    if (result.HitTacticalCollider == null)
                    {
                        result.HitTacticalCollider = tacticalCollider;
                        result.CoverType = tacticalCollider.ProvidesCover
                            ? tacticalCollider.CoverType
                            : CoverType.None;
                    }

                    if (tacticalCollider.BlocksLineOfSight)
                    {
                        result.HitTacticalCollider = tacticalCollider;
                        result.ReachedTarget = false;
                        result.CoverType = tacticalCollider.ProvidesCover
                            ? tacticalCollider.CoverType
                            : CoverType.None;
                        return result;
                    }
                }
            }

            if (terrainBlocks)
            {
                result.ReachedTarget = false;
                result.HitObject = null;
                result.HitTacticalCollider = null;
                result.CoverType = CoverType.Total;
                return result;
            }

            result.ReachedTarget = true;
            result.CoverType = CoverType.None;
            return result;
        }

        private static bool TryGetTerrainBlockDistance(Vector3 from, Vector3 to, out float blockDistance)
        {
            blockDistance = 0f;

            Vector3 delta = to - from;
            float distance = delta.magnitude;
            if (distance <= 0.001f)
            {
                return false;
            }

            int steps = Mathf.Max(2, Mathf.CeilToInt(distance / TerrainSampleSpacing));

            for (int i = 1; i < steps; i++)
            {
                float t = (float)i / steps;
                Vector3 samplePoint = Vector3.Lerp(from, to, t);

                if (!TerrainHeightMap.TryGetHeightWorldAtWorldPoint(samplePoint, out float terrainHeightWorld))
                {
                    continue;
                }

                if (samplePoint.y <= terrainHeightWorld + TerrainClearanceEpsilon)
                {
                    blockDistance = distance * t;
                    return true;
                }
            }

            return false;
        }

        private static CoverType DetermineCoverType(int clearRays, int totalRays)
        {
            if (totalRays <= 0 || clearRays <= 0)
            {
                return CoverType.Total;
            }

            float ratio = (float)clearRays / totalRays;

            if (ratio >= 1f)
            {
                return CoverType.None;
            }

            if (ratio >= 0.6f)
            {
                return CoverType.Light;
            }

            return CoverType.Heavy;
        }

        private static void DrawTargetingRays(AttackContext context)
        {
            foreach (TargetingRayResult rayResult in context.RayResults)
            {
                Color color = rayResult.ReachedTarget ? Color.green : Color.red;
                Debug.DrawLine(rayResult.From, rayResult.To, color);
            }
        }
    }
}
