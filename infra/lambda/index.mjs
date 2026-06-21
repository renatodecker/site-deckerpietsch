import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { createHash, randomBytes } from "crypto";

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE = process.env.TABLE_NAME;

function hash(pin) {
  return createHash("sha256").update(pin).digest("hex");
}

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[bytes[i] % chars.length];
  return code;
}

function generatePin() {
  const n = randomBytes(2).readUInt16BE(0) % 10000;
  return String(n).padStart(4, "0");
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, X-Album-Pin",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

async function createAlbum(body) {
  const name = (body.name || "Meu Álbum").slice(0, 60);
  const pin = generatePin();
  let code, attempts = 0;

  while (attempts < 5) {
    code = generateCode();
    try {
      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: {
          code,
          name,
          pinHash: hash(pin),
          data: "",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        ConditionExpression: "attribute_not_exists(code)",
      }));
      return json(201, { code, pin, name });
    } catch (e) {
      if (e.name === "ConditionalCheckFailedException") {
        attempts++;
        continue;
      }
      throw e;
    }
  }
  return json(500, { error: "Não foi possível gerar um código único." });
}

async function getAlbum(code) {
  const { Item } = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { code },
  }));
  if (!Item) return json(404, { error: "Álbum não encontrado." });
  return json(200, {
    code: Item.code,
    name: Item.name,
    data: Item.data,
    updatedAt: Item.updatedAt,
  });
}

async function updateAlbum(code, body, pinHeader) {
  if (!pinHeader) return json(401, { error: "PIN necessário." });

  const { Item } = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { code },
  }));
  if (!Item) return json(404, { error: "Álbum não encontrado." });
  if (Item.pinHash !== hash(pinHeader)) return json(403, { error: "PIN incorreto." });

  const updates = {};
  if (body.name !== undefined) updates.name = body.name.slice(0, 60);
  if (body.data !== undefined) updates.data = body.data;

  if (Object.keys(updates).length === 0) return json(400, { error: "Nada para atualizar." });

  let expr = "SET updatedAt = :now";
  const names = {};
  const values = { ":now": Date.now() };

  for (const [key, val] of Object.entries(updates)) {
    expr += `, #${key} = :${key}`;
    names[`#${key}`] = key;
    values[`:${key}`] = val;
  }

  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: { code },
    UpdateExpression: expr,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));

  return json(200, { ok: true });
}

async function deleteAlbum(code, pinHeader) {
  if (!pinHeader) return json(401, { error: "PIN necessário." });

  const { Item } = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { code },
  }));
  if (!Item) return json(404, { error: "Álbum não encontrado." });
  if (Item.pinHash !== hash(pinHeader)) return json(403, { error: "PIN incorreto." });

  await ddb.send(new DeleteCommand({
    TableName: TABLE,
    Key: { code },
  }));

  return json(200, { ok: true });
}

export async function handler(event) {
  const method = event.requestContext?.http?.method || event.httpMethod;
  const path = event.rawPath || event.path || "";

  if (method === "OPTIONS") return json(200, {});

  const match = path.match(/^\/api\/albums(?:\/([A-Z0-9]{6}))?$/);
  if (!match) return json(404, { error: "Rota não encontrada." });

  const code = match[1];
  const pinHeader = event.headers?.["x-album-pin"] || event.headers?.["X-Album-Pin"] || "";

  try {
    if (method === "POST" && !code) {
      const body = event.body ? JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body) : {};
      return await createAlbum(body);
    }
    if (method === "GET" && code) return await getAlbum(code);
    if (method === "PUT" && code) {
      const body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body);
      return await updateAlbum(code, body, pinHeader);
    }
    if (method === "DELETE" && code) return await deleteAlbum(code, pinHeader);

    return json(405, { error: "Método não permitido." });
  } catch (e) {
    console.error(e);
    return json(500, { error: "Erro interno." });
  }
}
