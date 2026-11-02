import "./page_loader.css";

/** Suspense fallback while a lazy page loads. It stays invisible for the first moments (CSS delay), so a fast load shows no flash. */
export function PageLoader() {
    return (
        <div className="page-loader" role="status">
            <span className="page-loader-spinner" aria-hidden="true" />
            <span className="page-loader-text">Loading…</span>
        </div>
    );
}
