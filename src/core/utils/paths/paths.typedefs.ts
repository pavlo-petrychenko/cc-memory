export enum PathErrorKind {
  NotAbsolute = "not_absolute",
}

/** `tryAbsPath`'s one failure mode: `value` didn't start with `/`. */
export type PathError = {
  readonly kind: PathErrorKind.NotAbsolute;
  readonly value: string;
};
