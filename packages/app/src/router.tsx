import { createHashRouter } from "react-router";
import { App } from "./App";
import { GlobalErrorBoundary } from "./components/GlobalErrorBoundary";
import { ProjectScope } from "./layouts/ProjectScope";
import { FloatProjectScope } from "./layouts/FloatProjectScope";
import { FloatRoot } from "./layouts/FloatRoot";
import { ChatPage } from "./pages/ChatPage";
import { ContentBrowserPage } from "./pages/ContentBrowserPage";
import { FloatChatPage } from "./pages/FloatChatPage";
import { FloatContentPage } from "./pages/FloatContentPage";
import { BrowserPage } from "./pages/BrowserPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { WelcomePagePage } from "./pages/WelcomePagePage";

export const router = createHashRouter([
  {
    path: "/",
    element: <App />,
    errorElement: <GlobalErrorBoundary />,
    children: [
      {
        index: true,
        element: <OnboardingPage />,
      },
      {
        path: "project/:projectId",
        element: <ProjectScope />,
        children: [
          {
            index: true,
            element: <WelcomePagePage />,
          },
          {
            path: "chat/:sessionId",
            element: <ChatPage />,
          },
          {
            path: "content",
            element: <ContentBrowserPage />,
          },
          {
            path: "browser",
            element: <BrowserPage />,
          },
        ],
      },
    ],
  },
  {
    path: "float",
    element: <FloatRoot />,
    errorElement: <GlobalErrorBoundary />,
    children: [
      {
        path: "chat/:projectId/:sessionId",
        element: <FloatProjectScope />,
        children: [
          {
            index: true,
            element: <FloatChatPage />,
          },
        ],
      },
      {
        path: "content/:projectId",
        element: <FloatProjectScope />,
        children: [
          {
            index: true,
            element: <FloatContentPage />,
          },
        ],
      },
    ],
  },
]);
