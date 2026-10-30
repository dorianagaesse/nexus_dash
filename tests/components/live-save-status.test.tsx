// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { LiveSaveStatus, liveSaveStatusText } from "@/components/live-save/live-save-status";
import type { LiveSavePhase } from "@/lib/live-save/types";
const phases:LiveSavePhase[]=["disabled","clean","dirty","sending","saved","offline-paused","hidden-paused","invalid-paused","auth-paused","gone-blocked","failed","conflict"];
test.each(phases)("autosave phase %s has no visual or accessible announcement", phase=>{
 const snapshot={phase,enabled:true,dirtyFields:[],invalidMessage:"Invalid input",failureMessage:"Unavailable",retryAt:5000,conflict:null,savedAt:null};
 const container=document.createElement("div"); const root=createRoot(container);
 act(()=>root.render(<LiveSaveStatus snapshot={snapshot}/>)); expect(container.innerHTML).toBe(""); expect(liveSaveStatusText(snapshot)).toBeNull(); act(()=>root.unmount());
});
