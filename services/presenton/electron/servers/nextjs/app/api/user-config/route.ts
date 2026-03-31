import { NextResponse } from "next/server";
import fs from "fs";
import { LLMConfig } from "@/types/llm_config";

const userConfigPath = process.env.USER_CONFIG_PATH!;
const canChangeKeys = process.env.CAN_CHANGE_KEYS !== "false";

export async function GET() {
  if (!canChangeKeys) {
    return NextResponse.json({
      error: "You are not allowed to access this resource",
      status: 403,
    });
  }
  if (!userConfigPath) {
    return NextResponse.json({
      error: "User config path not found",
      status: 500,
    });
  }

  if (!fs.existsSync(userConfigPath)) {
    return NextResponse.json({});
  }
  const configData = fs.readFileSync(userConfigPath, "utf-8");
  return NextResponse.json(JSON.parse(configData));
}

export async function POST(request: Request) {
  if (!canChangeKeys) {
    return NextResponse.json({
      error: "You are not allowed to access this resource",
    });
  }

  const userConfig = await request.json();

  let existingConfig: LLMConfig = {};
  if (fs.existsSync(userConfigPath)) {
    const configData = fs.readFileSync(userConfigPath, "utf-8");
    existingConfig = JSON.parse(configData);
  }
  const definedIncomingEntries = Object.entries(userConfig).filter(
    ([, value]) => value !== undefined
  );
  const mergedConfig: LLMConfig = {
    ...existingConfig,
    ...Object.fromEntries(definedIncomingEntries),
    CODEX_ACCESS_TOKEN: existingConfig.CODEX_ACCESS_TOKEN,
    CODEX_REFRESH_TOKEN: existingConfig.CODEX_REFRESH_TOKEN,
    CODEX_TOKEN_EXPIRES: existingConfig.CODEX_TOKEN_EXPIRES,
    CODEX_ACCOUNT_ID: existingConfig.CODEX_ACCOUNT_ID,
    USE_CUSTOM_URL:
      userConfig.USE_CUSTOM_URL === undefined
        ? existingConfig.USE_CUSTOM_URL
        : userConfig.USE_CUSTOM_URL,
  };
  fs.writeFileSync(userConfigPath, JSON.stringify(mergedConfig));
  return NextResponse.json(mergedConfig);
}
