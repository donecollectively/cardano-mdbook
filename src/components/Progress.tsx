"use client";
import React from "react";
import { Prose } from "@/components/Prose.jsx";

export const Progress: React.FC<any> = ({ children }) => {
    return (
        <div>
            <div aria-busy="true" aria-describedby="progress-bar"></div>
            <div className="progress progress-striped">
                <progress
                    className="progress-bar"
                    id="progress-bar"
                    aria-label="Content loading…"
                ></progress>
            </div>
        </div>
    );
};
