import { z } from "zod";
import { GetCurrentAuthUserResponse } from "./generated/api";

// AuthUser is the non-null user object from the auth response
export type AuthUser = NonNullable<z.infer<typeof GetCurrentAuthUserResponse>["user"]>;
