import { db } from "ponder:api";
import schema from "ponder:schema";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { graphql } from "ponder";

const app = new Hono();

app.use("*", cors());

app.use("/graphql", graphql({ db, schema }));
app.use("/", graphql({ db, schema }));

export default app;
