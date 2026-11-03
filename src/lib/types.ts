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
