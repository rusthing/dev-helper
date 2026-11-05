import { useState } from "react";
import { Tabs, type TabItem } from "../components/Tabs";
import Formatter from "./Formatter";
import Converter from "./Converter";
import Parser from "./Parser";

type GroupId = "format" | "convert" | "parse";

const GROUPS: TabItem<GroupId>[] = [
  { id: "format", label: "格式化" },
  { id: "convert", label: "转换" },
  { id: "parse", label: "解析" },
];

export default function Toolbox() {
  const [group, setGroup] = useState<GroupId>("format");

  return (
    <>
      <div className="group-tabs">
        <Tabs value={group} items={GROUPS} onChange={setGroup} />
      </div>
      <div hidden={group !== "format"}>
        <Formatter />
      </div>
      <div hidden={group !== "convert"}>
        <Converter />
      </div>
      <div hidden={group !== "parse"}>
        <Parser />
      </div>
    </>
  );
}
