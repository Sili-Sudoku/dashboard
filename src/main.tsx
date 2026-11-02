import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/app";
import { initPwa } from "@/app/pwa.ts";

initPwa();

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);
