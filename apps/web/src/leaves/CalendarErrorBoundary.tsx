import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Rendered instead of the children after an error. */
  fallback: ReactNode;
  /** A new value (Retry) renders the children again. */
  resetKey: number;
}

/**
 * LST-03: catches a failed load (or render) of the Calendar view so that only
 * the calendar area shows `fallback`; the toolbar, filters and the
 * List | Calendar toggle of `/leaves` stay usable (no router error page).
 */
export class CalendarErrorBoundary extends Component<
  Props,
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
