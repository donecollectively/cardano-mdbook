import React, { MouseEventHandler } from "react";
import link from "next/link.js"; const Link = link.default
import clsx from "clsx";

const styles = {
    primary: {
        className: "not-prose rounded-md bg-blue-700 py-2 px-4 "+ 
            "text-sm font-semibold text-slate-900 "+
            "border border-solid border-blue-600/50 "+
            "text-neutral-200 "+
            "hover:bg-blue-500 "+
            "focus:outline-none focus-visible:outline-2 "+
            "focus-visible:outline-offset-2 focus-visible:outline-blue-500 "+
            "active:bg-blue-500",
    },
    secondary: {
        className: "not-prose rounded-md bg-blue-900 py-2 px-4 text-sm font-medium "+
        "border border-solid border-blue-700/50 "+
        "text-neutral-400 hover:bg-slate-700 "+
        "disabled:bg-slate-700 disabled:border-blue-900 "+
        "focus:outline-none focus-visible:outline-2 "+
        "focus-visible:outline-offset-2 focus-visible:outline-white/50 "+
        "active:text-slate-400",
    }
};

type SpecialButtonProps =
( React.ComponentPropsWithoutRef<"button"> |
React.ComponentPropsWithoutRef<typeof Link> ) & 
{
    variant? : "primary" | "secondary",
    href? : string
}

interface propsType {
    children: any,
    style?: Record<string,any>;
    variant? : "primary" | "secondary",
    onClick: MouseEventHandler<any>,
    className? : string,
    href? : string
}
export  const Button : React.FC<SpecialButtonProps> = ({ 
    variant = "primary", 
    style={}, 
    children, 
    className,
    href,
     ...props 
}) => {
    const s = styles[variant];
    //@ts-expect-error importing clsx, argh!  webpack understands 
    //   it one way, typescript the opposite way
    className = clsx(s.className, className);
    if (href) {
        const lprops  =
        {children, href, className, style, ...props} as React.ComponentPropsWithoutRef<typeof Link>
        return <Link {...lprops} />
    }
    const bprops = {children, className, style, ...props} as React.ComponentPropsWithoutRef<"button">
     return <button {...bprops} />
}


{/* <button
className="btn border rounded float-right"
style={{
    padding: "0.75em",
    marginLeft: "0.5em",
    // marginTop: '-0.75em',
    border: "1px solid #162ed5",
    borderRadius: "0.5em",
    backgroundColor: "#142281",
}}
onClick={this.create}
>
List a Credential
</button> */}
