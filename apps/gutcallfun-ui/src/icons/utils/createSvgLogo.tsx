import { ElementType, FC, SVGProps } from "react";

const createSvgLogo = (Icon: ElementType, width: number, height: number) => {
  const IconComponent: FC<SVGProps<SVGSVGElement>> = (props) => (
    <Icon viewBox={`0 0 ${width} ${height}`} {...props} />
  );

  return IconComponent;
};

export default createSvgLogo;
