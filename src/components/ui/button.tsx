import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // HeroUI button: 40px, radius 12, regular weight, scale on press, opacity on hover.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[12px] text-sm font-normal leading-none cursor-pointer select-none transition-[transform,opacity,background-color,color,border-color] duration-200 active:scale-[0.97] outline-2 outline-offset-2 outline-transparent focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:opacity-80",
        destructive: "bg-destructive text-destructive-foreground hover:opacity-80",
        outline: "border-2 border-border-strong bg-transparent text-foreground hover:opacity-80",
        secondary: "bg-muted text-ink-2 hover:opacity-80",
        ghost: "bg-transparent text-ink-2 hover:bg-muted",
        link: "rounded-none font-semibold text-accent-foreground underline-offset-4 hover:underline hover:opacity-80 active:scale-100",
      },
      size: {
        default: "h-10 min-w-20 px-4",
        sm: "h-8 min-w-16 rounded-[8px] px-3 text-xs",
        lg: "h-10 min-w-20 px-4",
        icon: "h-10 w-10 min-w-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
