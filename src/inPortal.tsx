import React, { ReactNode } from "react";
import { createPortal } from "react-dom";
import { ClientSideOnly } from "./components/ClientSideOnly.jsx";

export function inPortal(domId: string, jsx: ReactNode | typeof React.Children) : any{
    if ("undefined" == typeof window) return <ClientSideOnly />;

    const portalTarget = document?.getElementById(domId);
    if (!portalTarget) {
        console.warn(`?? domId not available: ${domId}`)
        return <ClientSideOnly />
    }
    return createPortal(
        <ClientSideOnly>{jsx}</ClientSideOnly>,
        portalTarget
    );
}