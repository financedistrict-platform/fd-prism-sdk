package org.fdtech.prism.servlet;

import javax.servlet.ServletOutputStream;
import javax.servlet.WriteListener;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.nio.charset.Charset;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

final class FakeServlet {
    private FakeServlet() {
    }

    static HttpServletRequest request(String requestUri, String servletPath, String pathInfo, String authorization) {
        Map<String, Object> attributes = new HashMap<>();
        InvocationHandler handler = (proxy, method, args) -> {
            switch (method.getName()) {
                case "getAttribute":
                    return attributes.get((String) args[0]);
                case "setAttribute":
                    attributes.put((String) args[0], args[1]);
                    return null;
                case "getRequestURI":
                    return requestUri;
                case "getServletPath":
                    return servletPath;
                case "getPathInfo":
                    return pathInfo;
                case "getHeader":
                    return "Authorization".equalsIgnoreCase((String) args[0]) ? authorization : null;
                default:
                    return defaultValue(method);
            }
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                FakeServlet.class.getClassLoader(), new Class<?>[]{HttpServletRequest.class}, handler);
    }

    static Response response() {
        return new Response();
    }

    private static Object defaultValue(Method method) {
        Class<?> type = method.getReturnType();
        if (type == boolean.class) {
            return false;
        }
        if (type == int.class) {
            return 0;
        }
        if (type == long.class) {
            return 0L;
        }
        return null;
    }

    static final class Response implements InvocationHandler {
        private final ByteArrayOutputStream sent = new ByteArrayOutputStream();
        private final Map<String, String> headers = new LinkedHashMap<>();
        private int status = 200;
        private boolean committed;
        private boolean errorSent;
        private PrintWriter writer;
        private String characterEncoding = "ISO-8859-1";
        private final HttpServletResponse proxy = (HttpServletResponse) Proxy.newProxyInstance(
                FakeServlet.class.getClassLoader(), new Class<?>[]{HttpServletResponse.class}, this);

        HttpServletResponse proxy() {
            return proxy;
        }

        int status() {
            return status;
        }

        String header(String name) {
            return headers.get(name);
        }

        boolean errorSent() {
            return errorSent;
        }

        private void rejectWriteAfterError() {
            if (errorSent) {
                throw new IllegalStateException("response closed by sendError");
            }
        }

        boolean committed() {
            drainWriter();
            return committed;
        }

        int sentBytes() {
            drainWriter();
            return sent.size();
        }

        byte[] sent() {
            drainWriter();
            return sent.toByteArray();
        }

        String body() {
            return new String(sent(), Charset.forName(characterEncoding));
        }

        private void drainWriter() {
            if (writer != null) {
                writer.flush();
            }
        }

        @Override
        public Object invoke(Object proxyObject, Method method, Object[] args) throws Throwable {
            switch (method.getName()) {
                case "setStatus":
                    status = (Integer) args[0];
                    return null;
                case "getStatus":
                    return status;
                case "setHeader":
                case "addHeader":
                    headers.put((String) args[0], (String) args[1]);
                    return null;
                case "getHeader":
                    return headers.get((String) args[0]);
                case "setContentType":
                    headers.put("Content-Type", (String) args[0]);
                    return null;
                case "setCharacterEncoding":
                    characterEncoding = (String) args[0];
                    return null;
                case "getCharacterEncoding":
                    return characterEncoding;
                case "isCommitted":
                    return committed();
                case "flushBuffer":
                    committed = true;
                    return null;
                case "reset":
                    if (committed()) {
                        throw new IllegalStateException("response already committed");
                    }
                    sent.reset();
                    headers.clear();
                    status = 200;
                    return null;
                case "sendRedirect":
                    committed = true;
                    status = HttpServletResponse.SC_FOUND;
                    headers.put("Location", (String) args[0]);
                    return null;
                case "sendError":
                    rejectWriteAfterError();
                    committed = true;
                    errorSent = true;
                    status = (Integer) args[0];
                    return null;
                case "getOutputStream":
                    return new ServletOutputStream() {
                        @Override
                        public void write(int b) throws IOException {
                            rejectWriteAfterError();
                            committed = true;
                            sent.write(b);
                        }

                        @Override
                        public boolean isReady() {
                            return true;
                        }

                        @Override
                        public void setWriteListener(WriteListener writeListener) {
                        }
                    };
                case "getWriter":
                    writer = new PrintWriter(new OutputStreamWriter(new ByteArrayOutputStream() {
                        @Override
                        public synchronized void write(byte[] bytes, int offset, int length) {
                            rejectWriteAfterError();
                            committed = true;
                            sent.write(bytes, offset, length);
                        }
                    }, Charset.forName(characterEncoding)));
                    return writer;
                default:
                    return defaultValue(method);
            }
        }
    }
}
