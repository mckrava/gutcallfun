import { ElementType, FC } from "react";

import SvgIcon, { SvgIconProps } from "@mui/material/SvgIcon";

const resolve = (obj: {}, path: string, separator = ".") => {
  const properties = Array.isArray(path) ? path : path?.split(separator) || [];
  const innerColor = properties.reduce((prev, curr) => prev?.[curr], obj);

  if (typeof innerColor === "object") {
    return innerColor.main;
  }
  return innerColor;
};

type SXProps = {
  borderRadius?: string | number;
};

export type SvgIconPropsWithCustomColor = {
  color?: string;
} & Omit<SvgIconProps, "color">;

const createSvgIcon = (icon: ElementType, sx: SXProps = {}) => {
  const IconComponent: FC<SvgIconPropsWithCustomColor> = (props) => {
    const { color, ...otherProps } = props;

    // Support "inherit" to allow CSS color inheritance
    const colorValue = color === "inherit" ? "inherit" : undefined;

    return (
      <SvgIcon
        component={icon}
        inheritViewBox
        {...otherProps}
        sx={(theme) => ({
          color: colorValue ?? resolve(theme.palette, color as string),
          ...sx,
        })}
      />
    );
  };
  return IconComponent;
};

export default createSvgIcon;
