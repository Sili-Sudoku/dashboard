import AppRouter from "@/app/router.tsx";
import Providers from "@/app/providers.tsx";

import "@/style.css";

export default function App() {
    return (
        <Providers>
            <AppRouter />
        </Providers>
    );
}
