import { BrowserRouter } from "react-router-dom";
import type { PropsWithChildren } from "react";

const Providers = ({ children }: PropsWithChildren) => {
    return <BrowserRouter>{children}</BrowserRouter>;
};

export default Providers;
