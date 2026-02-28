import { useToolRenderer } from "@lioneltay/aikit-react";
import { ApprovalTool } from "./ApprovalTool";
import { BookFlightTool } from "./BookFlightTool";
import { SendEmailTool } from "./SendEmailTool";

export function ToolRenderers() {
  useToolRenderer("delete_records", (props) => <ApprovalTool {...props} />);
  useToolRenderer("book_flight", (props) => <BookFlightTool {...props} />);
  useToolRenderer("send_email", (props) => <SendEmailTool {...props} />);
  useToolRenderer("*", (props) => <ApprovalTool {...props} />);
  return null;
}
