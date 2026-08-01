/**
 * Tiny Markdown renderer for the legal/security documents (no dependency). Handles the small subset
 * those docs use: `#`/`##`/`###` headings, `- ` bullets, blank-line-separated paragraphs, and inline
 * `**bold**` / `_italic_`. Anything else renders as plain text.
 */
import { Fragment } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, font, spacing } from "../theme";

/** Split a line into styled spans for **bold** and _italic_. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).filter((p) => p !== "");
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) {
          return (
            <Text key={i} style={styles.bold}>
              {p.slice(2, -2)}
            </Text>
          );
        }
        if (p.startsWith("_") && p.endsWith("_")) {
          return (
            <Text key={i} style={styles.italic}>
              {p.slice(1, -1)}
            </Text>
          );
        }
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

export function LegalText({ body }: { body: string }) {
  const lines = body.split("\n");
  return (
    <View>
      {lines.map((line, i) => {
        if (line.startsWith("### ")) {
          return (
            <Text key={i} style={styles.h3}>
              <Inline text={line.slice(4)} />
            </Text>
          );
        }
        if (line.startsWith("## ")) {
          return (
            <Text key={i} style={styles.h2}>
              <Inline text={line.slice(3)} />
            </Text>
          );
        }
        if (line.startsWith("# ")) {
          return (
            <Text key={i} style={styles.h1}>
              <Inline text={line.slice(2)} />
            </Text>
          );
        }
        if (line.startsWith("- ")) {
          return (
            <View key={i} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletText}>
                <Inline text={line.slice(2)} />
              </Text>
            </View>
          );
        }
        if (line.trim() === "") return <View key={i} style={styles.gap} />;
        return (
          <Text key={i} style={styles.p}>
            <Inline text={line} />
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { color: colors.text, fontSize: font.h2, fontWeight: "900", marginBottom: spacing(2) },
  h2: { color: colors.text, fontSize: font.h3, fontWeight: "800", marginTop: spacing(4), marginBottom: spacing(1) },
  h3: { color: colors.text, fontSize: font.body, fontWeight: "800", marginTop: spacing(3), marginBottom: spacing(1) },
  p: { color: colors.textMuted, fontSize: font.body, lineHeight: 22 },
  bold: { color: colors.text, fontWeight: "800" },
  italic: { fontStyle: "italic", color: colors.textFaint },
  bulletRow: { flexDirection: "row", gap: spacing(2), paddingRight: spacing(2), marginTop: spacing(1) },
  bulletDot: { color: colors.primary, fontSize: font.body, lineHeight: 22 },
  bulletText: { flex: 1, color: colors.textMuted, fontSize: font.body, lineHeight: 22 },
  gap: { height: spacing(2) },
});
