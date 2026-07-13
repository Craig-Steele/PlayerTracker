using UnityEngine;

namespace Roll4InitiativeVTT.Map
{
    public enum CoverType
    {
        None,
        Light,
        Heavy,
        Total
    }

    public sealed class TacticalCollider : MonoBehaviour
    {
        [Header("Movement")]
        public bool BlocksMovement = true;

        [Header("Line of Sight")]
        public bool BlocksLineOfSight = true;

        [Header("Cover")]
        public bool ProvidesCover = false;
        public CoverType CoverType = CoverType.None;
    }
}