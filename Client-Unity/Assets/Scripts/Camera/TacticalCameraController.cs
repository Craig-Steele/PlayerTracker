using Roll4InitiativeVTT.Tokens;
using UnityEngine;
using UnityEngine.InputSystem;

namespace Roll4InitiativeVTT.Camera
{
    public sealed class TacticalCameraController : MonoBehaviour
    {
        [Header("Targeting")]
        [SerializeField] private Transform focusPoint;
        [SerializeField] private TokenView focusA;
        [SerializeField] private TokenView focusB;

        [Header("Orbit")]
        [SerializeField] private float distance = 18f;
        [SerializeField] private float minDistance = 5f;
        [SerializeField] private float maxDistance = 40f;
        [SerializeField] private float yaw = 0f;
        [SerializeField] private float pitch = 55f;
        [SerializeField] private float minPitch = 20f;
        [SerializeField] private float maxPitch = 85f;
        [SerializeField] private float orbitSpeed = 1f;

        [Header("Pan")]
        [SerializeField] private float panSpeed = 0.03f;

        [Header("Zoom")]
        [SerializeField] private float zoomSpeed = 0.1f;

        private Vector3 focusPosition;

        private void Start()
        {
            focusPosition = focusPoint != null ? focusPoint.position : Vector3.zero;
            UpdateCameraTransform();
        }

        private void Update()
        {
            Mouse mouse = Mouse.current;
            Keyboard keyboard = Keyboard.current;

            if (mouse == null || keyboard == null)
            {
                return;
            }

            HandleFocusShortcut(keyboard);
            HandleOrbit(mouse, keyboard);
            HandlePan(mouse, keyboard);
            HandleZoom(mouse);

            UpdateCameraTransform();
        }

        private void HandleFocusShortcut(Keyboard keyboard)
        {
            if (!keyboard.fKey.wasPressedThisFrame)
            {
                return;
            }

            if (focusA != null && focusB != null)
            {
                focusPosition = (focusA.transform.position + focusB.transform.position) * 0.5f;
                return;
            }

            if (focusA != null)
            {
                focusPosition = focusA.transform.position;
            }
        }

        private void HandleOrbit(Mouse mouse, Keyboard keyboard)
        {
            bool rightMouseDown = mouse.rightButton.isPressed;
            bool shiftDown = keyboard.leftShiftKey.isPressed || keyboard.rightShiftKey.isPressed;

            if (!rightMouseDown || shiftDown)
            {
                return;
            }

            Vector2 delta = mouse.delta.ReadValue();

            yaw += delta.x * orbitSpeed;
            pitch -= delta.y * orbitSpeed;
            pitch = Mathf.Clamp(pitch, minPitch, maxPitch);
        }

        private void HandlePan(Mouse mouse, Keyboard keyboard)
        {
            bool middleMouseDown = mouse.middleButton.isPressed;
            bool shiftDown = keyboard.leftShiftKey.isPressed || keyboard.rightShiftKey.isPressed;
            bool shiftRightMouseDown = shiftDown && mouse.rightButton.isPressed;

            if (!middleMouseDown && !shiftRightMouseDown)
            {
                return;
            }

            Vector2 delta = mouse.delta.ReadValue();

            Vector3 right = transform.right;
            Vector3 forward = Vector3.ProjectOnPlane(transform.forward, Vector3.up).normalized;

            focusPosition -= right * (delta.x * panSpeed * distance);
            focusPosition -= forward * (delta.y * panSpeed * distance);
        }

        private void HandleZoom(Mouse mouse)
        {
            float scroll = mouse.scroll.ReadValue().y;

            if (Mathf.Abs(scroll) < 0.001f)
            {
                return;
            }

            distance -= scroll * zoomSpeed;
            distance = Mathf.Clamp(distance, minDistance, maxDistance);
        }

        private void UpdateCameraTransform()
        {
            Quaternion rotation = Quaternion.Euler(pitch, yaw, 0f);
            Vector3 offset = rotation * new Vector3(0f, 0f, -distance);

            transform.position = focusPosition + offset;
            transform.LookAt(focusPosition);
        }
    }
}