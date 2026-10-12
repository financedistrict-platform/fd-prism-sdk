package org.fdtech.prism.core;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public final class PathNormalizer {
    private PathNormalizer() {
    }

    public static String normalize(String rawPath) {
        if (rawPath == null) {
            return "/";
        }

        String decoded = rawPath;
        String next = decodeOnce(decoded);
        while (!next.equals(decoded)) {
            decoded = next;
            next = decodeOnce(decoded);
        }

        if (containsControlCharacter(decoded)) {
            return null;
        }

        List<String> segments = new ArrayList<>();
        for (String segment : decoded.replace('\\', '/').split("/")) {
            String clean = stripParameters(segment);
            if (clean.isEmpty() || clean.equals(".")) {
                continue;
            }
            if (clean.equals("..")) {
                if (!segments.isEmpty()) {
                    segments.remove(segments.size() - 1);
                }
                continue;
            }
            segments.add(clean);
        }

        return ("/" + String.join("/", segments)).toLowerCase(Locale.ROOT);
    }

    private static String stripParameters(String segment) {
        int semicolon = segment.indexOf(';');
        return semicolon < 0 ? segment : segment.substring(0, semicolon);
    }

    private static boolean containsControlCharacter(String value) {
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c < 0x20 || c == 0x7f) {
                return true;
            }
        }
        return false;
    }

    private static String decodeOnce(String value) {
        if (value.indexOf('%') < 0) {
            return value;
        }

        StringBuilder out = new StringBuilder(value.length());
        ByteArrayOutputStream pending = new ByteArrayOutputStream();
        int i = 0;
        while (i < value.length()) {
            char c = value.charAt(i);
            if (c == '%' && i + 2 < value.length()) {
                int high = hexValue(value.charAt(i + 1));
                int low = hexValue(value.charAt(i + 2));
                if (high >= 0 && low >= 0) {
                    pending.write(high * 16 + low);
                    i += 3;
                    continue;
                }
            }
            flush(pending, out);
            out.append(c);
            i++;
        }
        flush(pending, out);
        return out.toString();
    }

    private static void flush(ByteArrayOutputStream pending, StringBuilder out) {
        if (pending.size() > 0) {
            out.append(new String(pending.toByteArray(), StandardCharsets.UTF_8));
            pending.reset();
        }
    }

    private static int hexValue(char c) {
        if (c >= '0' && c <= '9') {
            return c - '0';
        }
        if (c >= 'a' && c <= 'f') {
            return c - 'a' + 10;
        }
        if (c >= 'A' && c <= 'F') {
            return c - 'A' + 10;
        }
        return -1;
    }
}
