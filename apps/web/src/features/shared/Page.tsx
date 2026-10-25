import { Anchor, AppShell, Container, Group, MantineProvider, Paper, Stack, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

const navigation = [
  { to: "/test-runs", label: "テスト実行", match: (path: string) => path.startsWith("/test-runs") },
  { to: "/pull-requests", label: "プルリクエスト", match: (path: string) => path.startsWith("/pull-requests") },
  { to: "/test-definitions", label: "テスト定義", match: (path: string) => path === "/test-definitions" },
];

export function Page({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const location = useLocation();

  return (
    <MantineProvider defaultColorScheme="light">
      <AppShell header={{ height: 96 }} padding="lg">
        <AppShell.Header>
          <Container size="lg" h="100%">
            <Group h="100%" justify="space-between" wrap="nowrap">
              <Anchor component={Link} to="/test-runs" underline="never" className="brand">
                <span className="brand-mark" aria-hidden="true">
                  M
                </span>
                <span>
                  <Text fw={700} size="sm">
                    Manual Test Manager
                  </Text>
                  <Text c="dimmed" size="xs">
                    手動テスト管理
                  </Text>
                </span>
              </Anchor>
              <Group component="nav" aria-label="メインメニュー" gap={6} wrap="nowrap" className="nav-links">
                {navigation.map((item) => (
                  <Anchor
                    component={Link}
                    to={item.to}
                    key={item.to}
                    className={`nav-link${item.match(location.pathname) ? " active" : ""}`}
                    aria-current={item.match(location.pathname) ? "page" : undefined}
                    underline="never"
                  >
                    {item.label}
                  </Anchor>
                ))}
              </Group>
            </Group>
          </Container>
        </AppShell.Header>
        <AppShell.Main>
          <Container size="lg">
            <Stack gap="xl">
              <Paper withBorder radius="lg" p={{ base: "lg", sm: "xl" }} className="page-intro">
                <Text className="eyebrow" size="xs" fw={700}>
                  MANUAL TEST MANAGER
                </Text>
                <Title order={1} mt={6}>
                  {title}
                </Title>
                {description && (
                  <Text c="dimmed" mt="xs" maw={760}>
                    {description}
                  </Text>
                )}
              </Paper>
              <div className="page-content">{children}</div>
            </Stack>
          </Container>
        </AppShell.Main>
      </AppShell>
    </MantineProvider>
  );
}
