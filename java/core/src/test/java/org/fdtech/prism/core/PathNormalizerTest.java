package org.fdtech.prism.core;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class PathNormalizerTest {

    @ParameterizedTest
    @CsvSource({
            "/api/premium,/api/premium",
            "/api/premium/,/api/premium",
            "/API/Premium,/api/premium",
            "/api/%70remium,/api/premium",
            "/api/%50REMIUM,/api/premium",
            "/api/%2570remium,/api/premium",
            "/api/%252570remium,/api/premium",
            "/api/premium;jsessionid=abc,/api/premium",
            "/api;x=1/premium;y=2,/api/premium",
            "/api/premium%3Bx=1,/api/premium",
            "//api///premium,/api/premium",
            "/api/./premium,/api/premium",
            "/api/free/../premium,/api/premium",
            "/api/free/%2e%2e/premium,/api/premium",
            "/api/free/%2E%2E%2Fpremium,/api/premium",
            "/api/free/..;/premium,/api/premium",
            "/../../api/premium,/api/premium",
            "/api\\premium,/api/premium",
            "/api%5Cpremium,/api/premium",
            "/api%2Fpremium,/api/premium"
    })
    void collapsesEverySpellingToTheCanonicalPath(String raw, String expected) {
        assertEquals(expected, PathNormalizer.normalize(raw));
    }

    @Test
    void rootAndEmptyPathsAreTheRoot() {
        assertEquals("/", PathNormalizer.normalize(null));
        assertEquals("/", PathNormalizer.normalize(""));
        assertEquals("/", PathNormalizer.normalize("/"));
        assertEquals("/", PathNormalizer.normalize("/.."));
    }

    @Test
    void malformedEscapesStayLiteral() {
        assertEquals("/api/100%zz", PathNormalizer.normalize("/api/100%zz"));
        assertEquals("/api/100%", PathNormalizer.normalize("/api/100%"));
    }

    @Test
    void invalidUtf8NeverDecodesToRouteCharacters() {
        assertEquals("/api/\uFFFD", PathNormalizer.normalize("/api/%e9"));
    }

    @Test
    void decodesMultiByteUtf8() {
        assertEquals("/api/caf\u00e9", PathNormalizer.normalize("/api/caf%C3%A9"));
    }

    @Test
    void rejectsControlCharacters() {
        assertNull(PathNormalizer.normalize("/api/premium%00"));
        assertNull(PathNormalizer.normalize("/api/premium%0d%0a"));
        assertNull(PathNormalizer.normalize("/api/prem\u0000ium"));
        assertNull(PathNormalizer.normalize("/api/premium%7f"));
    }
}
