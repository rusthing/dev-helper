export interface TsUnit {
  label: string;
  value: string;
}

export interface TsRep {
  label: string;
  value: string;
}

export interface TsZone {
  name: string;
  id: string;
  offset: string;
  datetime: string;
  weekday: string;
}

export interface TsResult {
  millis: number | null;
  units: TsUnit[];
  reps: TsRep[];
  zones: TsZone[];
}

export interface HashResult {
  algo: string;
  output: string;
}

export interface ColorInfo {
  hex: string;
  hex8: string;
  rgb: string;
  hsl: string;
  r: number;
  g: number;
  b: number;
  a: number;
  error: string | null;
}

export interface CronInfo {
  normalized: string;
  fields: number;
  description: string;
}

