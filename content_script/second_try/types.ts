export interface Vector2 {
  x: number;
  y: number;
}

export type AttrValue = string | number | boolean | Vector2 | Array<AttrValue>;

export interface Resource {
  [key: string]: AttrValue;
}

export interface SceneObject {
  ext_resources: Resource[];
  sub_resources: Resource[];
  nodes: Resource[];
  connections: Resource[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}
