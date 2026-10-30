// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { RecoveryDraftNotice } from "@/components/recovery-draft-notice";

test.each([{}, {locallyStored:true}, {restored:true}, {conflict:true}, {error:"Storage unavailable"}, {incompatibleDraft:'{"version":2}'}])("recovery remains invisible for %j", (state) => {
 const container=document.createElement("div"); const root=createRoot(container); const onDiscard=vi.fn(), acceptConflict=vi.fn();
 act(()=>root.render(<RecoveryDraftNotice draft={{restored:false,locallyStored:false,conflict:false,error:null,incompatibleDraft:null,discard:vi.fn(),acceptConflict,saved:vi.fn(),flush:vi.fn(),...state}} onDiscard={onDiscard}/>));
 expect(container.innerHTML).toBe(""); expect(onDiscard).not.toHaveBeenCalled(); expect(acceptConflict).not.toHaveBeenCalled();
 act(()=>root.unmount());
});
