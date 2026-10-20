import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // HeroUI input (bordered): 40px, 2px border, radius 12, primary border on focus.
          "flex h-10 w-full rounded-[12px] border-2 border-input bg-transparent px-3 py-1 text-sm text-foreground shadow-[0_1px_2px_0_rgb(0_0_0/0.05)] transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-ink-4 hover:border-border-strong focus-visible:border-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive read-only:text-ink-2",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
