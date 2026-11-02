import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";

import "./error_boundary.css";

interface Props {
    children: ReactNode;
}

interface State {
    error: Error | null;
}

/**
 * Catches render-time throws in the page below it (for example a malformed /p/<blob> artifact).
 * The header and nav stay, and the user gets a message to recover from instead of a white screen.
 * Mount it with `key={pathname}`, so navigation away resets it.
 * It must be a class. React has no hook equivalent.
 */
export class ErrorBoundary extends Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error("Page crashed:", error, info.componentStack);
    }

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;
        return (
            <div className="error-page" role="alert">
                <h1>Something went wrong</h1>
                <p className="error-page-message">{error.message || "An unexpected error occurred."}</p>
                <div className="error-page-actions">
                    <button type="button" className="btn" onClick={() => this.setState({ error: null })}>
                        Try again
                    </button>
                    <Link to="/puzzles" className="btn">
                        Browse puzzles
                    </Link>
                </div>
            </div>
        );
    }
}
