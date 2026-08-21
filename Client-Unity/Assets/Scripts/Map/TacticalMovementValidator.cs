using UnityEngine;

namespace Roll4InitiativeVTT.Map
{
    public sealed class TacticalMovementValidator : MonoBehaviour
    {
        public TacticalMoveValidationOutcome ValidateMove(Vector2Int targetSquare)
        {
            if (!TacticalMapRuntime.IsReady())
            {
                return TacticalMoveValidationOutcome.Rejected("map-not-ready");
            }

            if (TacticalMapRuntime.IsBlocked(targetSquare.x, targetSquare.y))
            {
                return TacticalMoveValidationOutcome.Rejected("blocked-square");
            }

            return TacticalMoveValidationOutcome.Accepted();
        }
    }

    public readonly struct TacticalMoveValidationOutcome
    {
        public bool IsAccepted { get; }
        public string RejectionReason { get; }

        private TacticalMoveValidationOutcome(bool accepted, string rejectionReason)
        {
            IsAccepted = accepted;
            RejectionReason = rejectionReason;
        }

        public static TacticalMoveValidationOutcome Accepted()
        {
            return new TacticalMoveValidationOutcome(true, null);
        }

        public static TacticalMoveValidationOutcome Rejected(string rejectionReason)
        {
            return new TacticalMoveValidationOutcome(false, rejectionReason);
        }
    }
}
