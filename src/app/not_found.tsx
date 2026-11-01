import { Link } from "react-router-dom";

import "./error_boundary.css";

/** Catch-all route: shares the error page's layout (error_boundary.css). */
export default function NotFound() {
    return (
        <div className="error-page">
            <h1>Page not found</h1>
            <p className="error-page-message">There's nothing at this address.</p>
            <div className="error-page-actions">
                <Link to="/" className="btn">
                    Home
                </Link>
                <Link to="/puzzles" className="btn">
                    Browse puzzles
                </Link>
            </div>
        </div>
    );
}
