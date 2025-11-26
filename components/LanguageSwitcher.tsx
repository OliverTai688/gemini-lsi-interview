"use client";

import { useLanguage } from "@/context/LanguageContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Globe } from "lucide-react";

export default function LanguageSwitcher() {
  const { lang, setLang } = useLanguage();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="flex items-center gap-2 text-gray-700 hover:text-black"
        >
          <Globe className="w-4 h-4" />
          {lang === "en" ? "English" : "繁體中文"}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuItem onClick={() => setLang("en")}>
          English
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setLang("zh-TW")}>
          繁體中文
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
