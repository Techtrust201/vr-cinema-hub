import { Composition } from "remotion";
import { Test360 } from "./scenes/Test360";

export const RemotionRoot = () => (
  <Composition
    id="main"
    component={Test360}
    durationInFrames={300}
    fps={30}
    width={2048}
    height={1024}
  />
);