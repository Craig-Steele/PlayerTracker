using UnityEngine;

namespace Roll4InitiativeVTT.Tokens
{
    public sealed class TokenView : MonoBehaviour
    {
        [Header("Identity")]
        public string TokenId = "token";
        public string DisplayName = "Token";

        [Header("Tactical Position")]
        public string LevelId = "Level_0_Floor";
        public float HeightFeet = 6f;

        [Header("View Points")]
        [SerializeField] private Transform eyePoint;
        [SerializeField] private Transform centerPoint;

        public Vector3 BasePosition => transform.position;

        public Vector3 EyePosition
        {
            get
            {
                if (eyePoint != null)
                {
                    return eyePoint.position;
                }

                Bounds bounds = GetVisualBounds();
                return new Vector3(
                    bounds.center.x,
                    bounds.min.y + bounds.size.y * 0.85f,
                    bounds.center.z
                );
            }
        }

        public Vector3 CenterPosition
        {
            get
            {
                if (centerPoint != null)
                {
                    return centerPoint.position;
                }

                Bounds bounds = GetVisualBounds();
                return bounds.center;
            }
        }

        public Bounds GetVisualBounds()
        {
            Renderer renderer = GetComponentInChildren<Renderer>();
            if (renderer != null)
            {
                return renderer.bounds;
            }

            return new Bounds(transform.position, Vector3.one);
        }

        public Vector3[] GetTargetSamplePoints(Vector3 observerPosition)
        {
            Bounds bounds = GetVisualBounds();

            Vector3 center = bounds.center;

            Vector3 top = new Vector3(
                bounds.center.x,
                bounds.min.y + bounds.size.y * 0.85f,
                bounds.center.z
            );

            Vector3 bottom = new Vector3(
                bounds.center.x,
                bounds.min.y + bounds.size.y * 0.20f,
                bounds.center.z
            );

            Vector3 toTarget = center - observerPosition;
            Vector3 horizontalToTarget = Vector3.ProjectOnPlane(toTarget, Vector3.up);

            Vector3 viewRight;

            if (horizontalToTarget.sqrMagnitude < 0.0001f)
            {
                viewRight = transform.right;
            }
            else
            {
                Vector3 horizontalViewDirection = horizontalToTarget.normalized;
                viewRight = Vector3.Cross(Vector3.up, horizontalViewDirection).normalized;
            }

            float horizontalRadius = Mathf.Max(bounds.extents.x, bounds.extents.z);

            Vector3 left = center - viewRight * horizontalRadius;
            Vector3 right = center + viewRight * horizontalRadius;

            return new[]
            {
                center,
                top,
                bottom,
                left,
                right
            };
        }
    }
}