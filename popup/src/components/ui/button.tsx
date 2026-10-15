import type { RefAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import {
  Button as AriaButton,
  Link as AriaLink,
  composeRenderProps,
  type ButtonProps as AriaButtonProps,
  type LinkProps as AriaLinkProps,
} from "react-aria-components";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[focus-visible]:border-ring data-[focus-visible]:ring-ring/50 data-[focus-visible]:ring-[3px] aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs data-[hovered]:bg-primary/90",
        destructive:
          "bg-destructive text-white shadow-xs data-[hovered]:bg-destructive/90 data-[focus-visible]:ring-destructive/20 dark:bg-destructive/60 dark:data-[focus-visible]:ring-destructive/40",
        outline:
          "border bg-background shadow-xs data-[hovered]:bg-accent data-[hovered]:text-accent-foreground dark:border-input dark:bg-input/30 dark:data-[hovered]:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs data-[hovered]:bg-secondary/80",
        ghost:
          "data-[hovered]:bg-accent data-[hovered]:text-accent-foreground dark:data-[hovered]:bg-accent/50",
        link: "text-primary underline-offset-4 data-[hovered]:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = AriaButtonProps &
  RefAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

type LinkButtonProps = AriaLinkProps &
  RefAttributes<HTMLAnchorElement> &
  VariantProps<typeof buttonVariants>;

function Button({ className, variant = "default", size = "default", ...props }: ButtonProps) {
  return (
    <AriaButton
      {...props}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={composeRenderProps(className, (className) =>
        cn(buttonVariants({ variant, size, className })),
      )}
    />
  );
}

function LinkButton({
  className,
  variant = "default",
  size = "default",
  ...props
}: LinkButtonProps) {
  return (
    <AriaLink
      {...props}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={composeRenderProps(className, (className) =>
        cn(buttonVariants({ variant, size, className })),
      )}
    />
  );
}

export { Button, LinkButton, buttonVariants, type ButtonProps, type LinkButtonProps };
