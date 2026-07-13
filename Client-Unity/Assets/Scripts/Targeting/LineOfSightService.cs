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

            if (distance <= 0.001f)
            {
                result.ReachedTarget = true;
                return result;
            }

            if (Physics.Raycast(from, delta.normalized, out RaycastHit hit, distance, obstructionMask))
            {
                result.HitObject = hit.collider.gameObject;

                TokenView hitToken = hit.collider.GetComponentInParent<TokenView>();

                if (hitToken == destination)
                {
                    result.ReachedTarget = true;
                    result.CoverType = CoverType.None;
                    return result;
                }

                TacticalCollider tacticalCollider = hit.collider.GetComponent<TacticalCollider>();
                result.HitTacticalCollider = tacticalCollider;

                if (tacticalCollider == null)
                {
                    result.ReachedTarget = false;
                    result.CoverType = CoverType.Total;
                    return result;
                }

                result.ReachedTarget = !tacticalCollider.BlocksLineOfSight;
                result.CoverType = tacticalCollider.ProvidesCover
                    ? tacticalCollider.CoverType
                    : CoverType.None;

                return result;
            }

            result.ReachedTarget = true;
            result.CoverType = CoverType.None;
            return result;
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