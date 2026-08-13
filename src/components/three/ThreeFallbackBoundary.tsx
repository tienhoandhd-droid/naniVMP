import { Component, type ErrorInfo, type ReactNode } from "react";

export function ThreeFallbackMessage({ onUse2D }: { onUse2D: () => void }) {
  return (
    <div className="workload-map-fallback" role="alert">
      <p>Không dựng được bản đồ 3D trên thiết bị này.</p>
      <button type="button" onClick={onUse2D}>Xem bảng nhiệt 2D</button>
    </div>
  );
}

export class ThreeFallbackBoundary extends Component<{
  children: ReactNode;
  onUse2D: () => void;
}, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // The 2D alternative is deliberately user-triggered; never retry WebGL.
  }

  render() {
    return this.state.hasError
      ? <ThreeFallbackMessage onUse2D={this.props.onUse2D} />
      : this.props.children;
  }
}
