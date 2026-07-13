using Roll4InitiativeVTT.Targeting;
using Roll4InitiativeVTT.Tokens;
using TMPro;
using UnityEngine;

namespace Roll4InitiativeVTT.UI
{
    public sealed class AttackContextDebugPanel : MonoBehaviour
    {
        private const float FeetPerUnityUnit = 3.28084f;

        [Header("Services")]
        [SerializeField] private LineOfSightService lineOfSightService;

        [Header("Tokens")]
        [SerializeField] private TokenView attacker;
        [SerializeField] private TokenView target;

        [Header("UI")]
        [SerializeField] private TMP_Text outputText;

        private void Update()
        {
            if (outputText == null)
            {
                return;
            }

            if (lineOfSightService == null || attacker == null || target == null)
            {
                outputText.text =
                    "Attack Context Debug\n" +
                    "Missing reference:\n" +
                    $"LineOfSightService: {lineOfSightService != null}\n" +
                    $"Attacker: {attacker != null}\n" +
                    $"Target: {target != null}";
                return;
            }

            AttackContext context = lineOfSightService.BuildAttackContext(attacker, target);

            outputText.text =
                "Attack Context Debug\n" +
                $"Attacker: {attacker.DisplayName}\n" +
                $"Target: {target.DisplayName}\n" +
                $"Line of Sight: {context.HasLineOfSight}\n" +
                $"Clear Rays: {context.ClearRayCount}/{context.TotalRayCount}\n" +
                $"Visibility Ratio: {context.VisibilityRatio:P1}\n" +
                $"Horizontal: {ToFeet(context.HorizontalDistance):0.0} ft\n" +
                $"Vertical: {ToFeet(context.VerticalDistance):0.0} ft\n" +
                $"True Distance: {ToFeet(context.TrueDistance):0.0} ft\n" +
                $"Hit Object: {GetHitObjectName(context)}\n" +
                $"Cover: {context.CoverType}";
        }

        private static float ToFeet(float unityUnits)
        {
            return unityUnits * FeetPerUnityUnit;
        }

        private static string GetHitObjectName(AttackContext context)
        {
            return context.HitObject != null ? context.HitObject.name : "None";
        }
    }
}