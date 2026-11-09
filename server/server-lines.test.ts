import { describe, expect, it } from "vitest";

import "./server-line-packs.ts";
import { serverLine } from "./server-lines.ts";

describe("serverLine", () => {
  it("writes the line in the language given, with its values filled in", () => {
    expect(serverLine("pt-br", "server.reports.sent", { report: "r-1" })).toBe("Relatório r-1 salvo neste computador, na pasta bug-reports dos dados do app. Você pode mandar o arquivo para quem cuida do seu Otávio Bot.");
    expect(serverLine("de", "server.reports.sent", { report: "r-1" })).toBe("Fehlerbericht r-1 auf diesem Computer gespeichert, im Ordner bug-reports in den Daten der App. Du kannst die Datei an die Person schicken, die sich um deinen Otávio Bot kümmert.");
    expect(serverLine(undefined, "server.reports.sent", { report: "r-1" })).toBe("Bug report r-1 saved on this computer, in the bug-reports folder of the app's data. You can send the file to whoever looks after your Otávio Bot.");
    expect(serverLine("en", "server.reports.when.minutes", { count: 5 })).toBe("in about 5 minutes");
  });

  it("reads a regional tag as its language, and a language it has no words for as English", () => {
    expect(serverLine("de-AT", "server.reports.when.soon")).toBe("so bald wie möglich");
    expect(serverLine("pt", "server.reports.when.soon")).toBe(serverLine("pt-br", "server.reports.when.soon"));
    expect(serverLine("zh-Hant", "server.reports.when.soon")).toBe(serverLine("zh-tw", "server.reports.when.soon"));
    expect(serverLine("nl", "server.reports.when.soon")).toBe("as soon as it can");
  });

  it("leaves a {name} it was given no value for as it is", () => {
    expect(serverLine("en", "server.reports.refused", {})).toBe("The MausBot team's server refused this bug report, so nothing was sent: {detail}.");
  });
});
