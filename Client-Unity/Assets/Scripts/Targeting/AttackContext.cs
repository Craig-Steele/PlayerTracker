using System.Collections.Generic;
using Roll4InitiativeVTT.Map;
using Roll4InitiativeVTT.Tokens;
using UnityEngine;

namespace Roll4InitiativeVTT.Targeting
{
    public sealed class TargetingRayResult
    {
        public Vector3 From { get; set; }
        public Vector3 To { get; set; }

        public bool ReachedTarget { get; set; }
        public GameObject HitObject { get; set; }
        public TacticalCollider HitTacticalCollider { get; set; }

        public CoverType CoverType { get; set; } = CoverType.None;
    }

    public sealed class AttackContext
    {
        public TokenView Attacker { get; }
        public TokenView Target { get; }

        public bool HasLineOfSight { get; set; }

        public float HorizontalDistance { get; set; }
        public float VerticalDistance { get; set; }
        public float TrueDistance { get; set; }

        public GameObject HitObject { get; set; }
        public TacticalCollider HitTacticalCollider { get; set; }

        public CoverType CoverType { get; set; } = CoverType.None;

        public List<TargetingRayResult> RayResults { get; } = new();

        public int ClearRayCount
        {
            get
            {
                int count = 0;

                foreach (TargetingRayResult rayResult in RayResults)
                {
                    if (rayResult.ReachedTarget)
                    {
                        count++;
                    }
                }

                return count;
            }
        }

        public int TotalRayCount => RayResults.Count;

        public float VisibilityRatio
        {
            get
            {
                if (TotalRayCount == 0)
                {
                    return 0f;
                }

                return (float)ClearRayCount / TotalRayCount;
            }
        }

        public AttackContext(TokenView attacker, TokenView target)
        {
            Attacker = attacker;
            Target = target;
        }

        public override string ToString()
        {
            string hitName = HitObject != null ? HitObject.name : "None";

            return
                $"AttackContext: {Attacker.DisplayName} -> {Target.DisplayName}\n" +
                $"  HasLineOfSight: {HasLineOfSight}\n" +
                $"  HorizontalDistance: {HorizontalDistance:0.00}\n" +
                $"  VerticalDistance: {VerticalDistance:0.00}\n" +
                $"  TrueDistance: {TrueDistance:0.00}\n" +
                $"  Clear Rays: {ClearRayCount}/{TotalRayCount}\n" +
                $"  Visibility Ratio: {VisibilityRatio:0.00}\n" +
                $"  HitObject: {hitName}\n" +
                $"  CoverType: {CoverType}";
        }
    }
}