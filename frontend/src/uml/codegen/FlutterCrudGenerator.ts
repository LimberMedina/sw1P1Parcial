// src/uml/codegen/FlutterCrudGenerator.ts

export interface ClassDefinition {
  name: string;
  attributes: string[]; // "nombre: Tipo" | "Tipo nombre" | "nombre"
  methods: string[];
}

export interface RelationDefinition {
  source: string; // clase origen
  target: string; // clase destino
  type: "ONE_TO_ONE" | "ONE_TO_MANY" | "MANY_TO_ONE" | "MANY_TO_MANY";
  bidirectional: boolean;
  // opcionales (si los pasas desde el front, no molestan)
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
  name?: string;
  navigationProperty?: string;
}

// Tipos internos mejorados para procesamiento
interface ProcessedRelation {
  source: string;
  target: string;
  type: "ONE_TO_ONE" | "ONE_TO_MANY" | "MANY_TO_ONE" | "MANY_TO_MANY";
  bidirectional: boolean;
  ownerSide: "source" | "target"; // Quién tiene la FK
  name?: string;
}

type ParsedAttr = { type: string; name: string };

export class FlutterCrudGenerator {
  private classes: ClassDefinition[] = [];
  private relations: RelationDefinition[] = [];
  private processedRelations: ProcessedRelation[] = [];
  private appName: string;
  private packageName: string;
  private apiBaseUrl: string;

  constructor(opts?: {
    appName?: string;
    packageName?: string; // para Android/iOS bundle id (placeholder)
    apiBaseUrl?: string; // REST base URL, ej: http://10.0.2.2:8080
  }) {
    this.appName = opts?.appName ?? "UmlCrudApp";
    this.packageName = opts?.packageName ?? "com.example.umlcrud";
    this.apiBaseUrl = opts?.apiBaseUrl ?? "http://10.0.2.2:8080";
  }

  addClass(cls: ClassDefinition) {
    this.classes.push(cls);
  }

  addRelation(relation: RelationDefinition) {
    this.relations.push(relation);
  }

  /**
   * Analiza las multiplicidades para determinar el tipo exacto de relación
   * y quién debe tener la llave foránea
   */
  private analyzeMultiplicity(multStr: string): {
    isMany: boolean;
    isOptional: boolean;
  } {
    const cleaned = (multStr || "").trim();

    // Patrones comunes: 1, 0..1, 1..1, 1..*, 0..*, *, n, N, many
    const isManyPattern = /\*|n|N|many|\.\.(\*|n|N)|(\d+)\.\.\*/i.test(cleaned);
    const isOptionalPattern = /^0\.\./i.test(cleaned);

    return {
      isMany: isManyPattern,
      isOptional: isOptionalPattern,
    };
  }

  /**
   * Procesa todas las relaciones y determina correctamente los tipos
   * basándose en las multiplicidades
   */
  private processRelations() {
    this.processedRelations = [];

    this.relations.forEach((rel) => {
      const srcMult = this.analyzeMultiplicity(rel.sourceMultiplicity || "");
      const tgtMult = this.analyzeMultiplicity(rel.targetMultiplicity || "");

      let type: "ONE_TO_ONE" | "ONE_TO_MANY" | "MANY_TO_ONE" | "MANY_TO_MANY";
      let ownerSide: "source" | "target";

      // Determinar tipo de relación según cardinalidades
      if (srcMult.isMany && tgtMult.isMany) {
        // *..* → MANY_TO_MANY
        type = "MANY_TO_MANY";
        ownerSide = "source"; // Por convención, source crea la tabla intermedia
      } else if (srcMult.isMany && !tgtMult.isMany) {
        // *..1 → MANY_TO_ONE (muchos source → un target)
        // FK debe estar en SOURCE
        type = "MANY_TO_ONE";
        ownerSide = "source";
      } else if (!srcMult.isMany && tgtMult.isMany) {
        // 1..* → ONE_TO_MANY (un source → muchos target)
        // FK debe estar en TARGET
        type = "ONE_TO_MANY";
        ownerSide = "target";
      } else {
        // 1..1 → ONE_TO_ONE
        type = "ONE_TO_ONE";
        // Por convención, el lado source tiene la FK
        ownerSide = "source";
      }

      this.processedRelations.push({
        source: rel.source,
        target: rel.target,
        type,
        bidirectional: rel.bidirectional,
        ownerSide,
        name: rel.name,
      });
    });
  }

  // ===== Helpers =====
  private safeStr(s: unknown, fallback = ""): string {
    const v = String(s ?? "").trim();
    return v || fallback;
  }

  private sanitizeId(raw: string, fallback: string): string {
    let s = this.safeStr(raw, fallback).replace(/[^\p{L}\p{N}_$]/gu, "_");
    if (/^\d/.test(s)) s = "_" + s;
    return s;
  }

  private toPascal(str: string): string {
    const s = this.safeStr(str);
    if (!s) return "Value";
    let clean = s.replace(/[^\p{L}\p{N}_$]/gu, "_");
    if (/^\d/.test(clean)) clean = "_" + clean;
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  private toCamel(str: string): string {
    const s = this.safeStr(str);
    if (!s) return "value";
    const out = s.charAt(0).toLowerCase() + s.slice(1);
    const reserved = ["class", "enum", "import", "switch"];
    return reserved.includes(out) ? `${out}Value` : out;
  }

  private toSnake(str: string): string {
    return this.safeStr(str)
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/\W+/g, "_")
      .toLowerCase();
  }

  private toPlural(s: string): string {
    if (/(s|sh|ch|x|z)$/.test(s)) return s + "es";
    if (/[^aeiou]y$/.test(s)) return s.slice(0, -1) + "ies";
    if (s.endsWith("f")) return s.slice(0, -1) + "ves";
    if (s.endsWith("fe")) return s.slice(0, -2) + "ves";
    return s + "s";
  }

  private isJavaLikeType(token: string): boolean {
    const t = token.trim();
    const commons = [
      "String",
      "Integer",
      "Long",
      "Double",
      "Float",
      "Boolean",
      "BigDecimal",
      "Date",
      "LocalDate",
      "LocalDateTime",
      "UUID",
      "int",
      "long",
      "double",
      "float",
      "boolean",
    ];
    return commons.includes(t) || /^[A-Z]\w*$/.test(t);
  }

  /** Acepta: "nombre: Tipo" | "Tipo nombre" | "nombre" */
  private parseAttribute(line: string, index: number): ParsedAttr {
    const raw = this.safeStr(line);
    if (!raw) return { type: "String", name: `field_${index + 1}` };

    const colonIdx = raw.indexOf(":");
    if (colonIdx !== -1) {
      let name = this.sanitizeId(
        raw.slice(0, colonIdx).trim(),
        `field_${index + 1}`
      );
      let type = this.safeStr(raw.slice(colonIdx + 1), "String").trim();
      type = this.mapToDartType(type);
      name = this.toCamel(name);
      return { type, name };
    }
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length === 2 && this.isJavaLikeType(parts[0])) {
      let type = this.mapToDartType(parts[0]);
      let name = this.sanitizeId(parts[1], `field_${index + 1}`);
      name = this.toCamel(name);
      return { type, name };
    }
    let name = this.sanitizeId(raw, `field_${index + 1}`);
    name = this.toCamel(name);
    return { type: "String", name };
  }

  private mapToDartType(type: string): string {
    const t = type.trim();
    const map: Record<string, string> = {
      int: "int",
      Int: "int",
      integer: "int",
      Integer: "int",
      long: "int",
      Long: "int",
      double: "double",
      Double: "double",
      float: "double",
      Float: "double",
      decimal: "double",
      Decimal: "double",
      money: "double",
      currency: "double",
      string: "String",
      String: "String",
      text: "String",
      Text: "String",
      bool: "bool",
      Bool: "bool",
      boolean: "bool",
      Boolean: "bool",
      date: "String",
      Date: "String",
      datetime: "String",
      DateTime: "String",
      timestamp: "String",
      uuid: "String",
      UUID: "String",
      guid: "String",
    };
    if (map[t]) return map[t];
    if (/^[A-Z]\w*$/.test(t)) return "String";
    return "String";
  }

  private valueSample(dartType: string, name: string) {
    switch (dartType) {
      case "int":
        return 1;
      case "double":
        return 1.0;
      case "bool":
        return true;
      default:
        return `"sample_${name}"`;
    }
  }

  // ===== Generate Project Files =====
  generateAll(): Record<string, string> {
    // ✅ PROCESAR RELACIONES ANTES DE GENERAR MODELOS
    this.processRelations();

    const files: Record<string, string> = {};
    files["pubspec.yaml"] = this.generatePubspec();
    files["analysis_options.yaml"] = this.generateAnalysisOptions();
    files[".gitignore"] = this.generateGitIgnore();
    files["README.md"] = this.generateReadme();
    files["CONEXION.md"] = this.generateConnectionGuide();

    files["lib/config.dart"] = this.generateConfig();
    files["lib/core/api_client.dart"] = this.generateApiClient();
    files["lib/core/result.dart"] = this.generateResult();
    files["lib/widgets/app_scaffold.dart"] = this.generateAppScaffold();
    files["lib/screens/home_page.dart"] = this.generateHomePage(); // NUEVO
    files["lib/routes.dart"] = this.generateRoutes();
    files["lib/main.dart"] = this.generateMain();

    this.classes.forEach((cls) => {
      const className = this.toPascal(cls.name);
      const fileBase = this.toSnake(className);
      files[`lib/models/${fileBase}.dart`] = this.generateModel(cls);
      files[`lib/services/${fileBase}_service.dart`] =
        this.generateService(cls);
      files[`lib/screens/${fileBase}/${fileBase}_list_page.dart`] =
        this.generateListPage(cls);
      files[`lib/screens/${fileBase}/${fileBase}_form_page.dart`] =
        this.generateFormPage(cls);
      files[`lib/screens/${fileBase}/${fileBase}_detail_page.dart`] =
        this.generateDetailPage(cls);
    });

    return files;
  }

  // ===== Core files =====
  private generatePubspec(): string {
    return `name: ${this.toSnake(this.appName)}
description: "CRUD generado desde diagrama UML"
publish_to: "none"
version: 0.1.0+1
environment:
  sdk: ">=3.3.0 <4.0.0"

dependencies:
  flutter:
    sdk: flutter
  http: ^1.2.0

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^4.0.0

flutter:
  uses-material-design: true
`;
  }

  private generateAnalysisOptions(): string {
    return `include: package:flutter_lints/flutter.yaml
analyzer:
  exclude:
    - "**/*.g.dart"
    - "build/**"
`;
  }

  private generateGitIgnore(): string {
    return `build/
.dart_tool/
.packages
pubspec.lock
android/local.properties
ios/Pods/
**/*.iml
`;
  }

  private generateReadme(): string {
    return `# ${this.appName}

App Flutter generada automáticamente para CRUD de entidades del diagrama UML.

## 🔧 Configuración de Conexión Backend

**⚠️ IMPORTANTE:** Antes de ejecutar, debes configurar la URL del backend en \`lib/config.dart\`

### Según tu plataforma:

#### 📱 Android Emulator
\`\`\`dart
const String kApiBaseUrl = "http://10.0.2.2:8080";
\`\`\`

#### 🖥️ Flutter Web/Windows/macOS/Linux (misma PC que backend)
\`\`\`dart
const String kApiBaseUrl = "http://localhost:8080";
\`\`\`

#### 📱 Dispositivo Físico Android/iOS
Usa la IP local de tu PC donde corre el backend (deben estar en la misma WiFi):
\`\`\`dart
const String kApiBaseUrl = "http://192.168.1.100:8080";
\`\`\`

## 🚀 Ejecutar el proyecto

### Primera vez (solo si falta soporte web/desktop):
\`\`\`bash
flutter create .
\`\`\`

### Instalar dependencias:
\`\`\`bash
flutter pub get
\`\`\`

### Ejecutar:
\`\`\`bash
flutter run
\`\`\`

## ✅ Verificar Conexión

1. Asegúrate de que el backend Spring Boot esté corriendo en \`http://localhost:8080\`
2. Verifica la URL en \`lib/config.dart\` según tu plataforma
3. Si hay problemas de conexión, revisa que CORS esté habilitado en el backend
`;
  }

  private generateConnectionGuide(): string {
    return `# 🔌 Guía de Conexión Flutter ↔️ Spring Boot

Esta guía te ayudará a conectar correctamente tu app Flutter con el backend Spring Boot.

## 📋 Checklist Rápido

- [ ] Backend Spring Boot corriendo
- [ ] Configurada URL correcta en \`lib/config.dart\`
- [ ] CORS habilitado en backend
- [ ] Misma red WiFi (si usas dispositivo físico)

---

## 1️⃣ Iniciar el Backend

En la carpeta del proyecto Spring Boot:

\`\`\`bash
mvn spring-boot:run
\`\`\`

Verás un mensaje como:
\`\`\`
Tomcat started on port(s): 8080 (http)
\`\`\`

✅ Backend listo en: **http://localhost:8080**

---

## 2️⃣ Configurar URL en Flutter

Edita \`lib/config.dart\` según tu plataforma:

### 🖥️ Flutter Web/Desktop (misma PC)
\`\`\`dart
const String kApiBaseUrl = "http://localhost:8080";
\`\`\`

### 📱 Android Emulator
\`\`\`dart
const String kApiBaseUrl = "http://10.0.2.2:8080";
\`\`\`

### 📱 Dispositivo Físico
1. Encuentra la IP de tu PC:
   - Windows: \`ipconfig\` → busca "IPv4"
   - Mac/Linux: \`ifconfig\` → busca "inet"
   - Ejemplo: 192.168.1.100

2. Configura en Flutter:
\`\`\`dart
const String kApiBaseUrl = "http://192.168.1.100:8080";
\`\`\`

⚠️ **Importante:** Tu teléfono y PC deben estar en la misma red WiFi

---

## 3️⃣ Ejecutar Flutter

\`\`\`bash
flutter pub get
flutter run
\`\`\`

---

## 🐛 Solución de Problemas

### ❌ "Failed to connect" / "Connection refused"

**Causa:** Backend no está corriendo o URL incorrecta

**Solución:**
1. Verifica que el backend esté corriendo
2. Abre http://localhost:8080/h2-console en tu navegador
3. Si no carga, reinicia el backend
4. Verifica la URL en \`lib/config.dart\`

### ❌ "XMLHttpRequest error" (Flutter Web)

**Causa:** CORS bloqueando peticiones

**Solución:**
El backend generado ya tiene CORS configurado. Si sigue fallando:
1. Verifica que \`CorsConfig.java\` existe en \`src/main/java/com/example/config/\`
2. Reinicia el backend
3. Limpia caché del navegador

### ❌ "Timeout" 

**Causa:** Backend muy lento o no responde

**Solución:**
1. Verifica logs del backend en la terminal
2. Revisa que H2 database esté inicializando correctamente
3. Aumenta timeout en \`lib/core/api_client.dart\` (línea del \`.timeout\`)

### ❌ "No route found" / 404

**Causa:** Endpoint incorrecto

**Solución:**
1. Verifica los logs de Flutter (🌐 símbolos en consola)
2. Compara con endpoints del backend: \`/api/{entidad}s\`
3. Ejemplo: si la entidad es "User", el endpoint es \`/api/users\`

---

## 🧪 Probar Conexión Manualmente

### Desde el navegador:
\`\`\`
http://localhost:8080/api/{entidad}s
\`\`\`

### Desde Postman:
Importa los archivos generados:
- \`postman-collection.json\`
- \`postman-environment.json\`

---

## 📊 Logs de Debug

Flutter imprime logs útiles en consola:

\`\`\`
🌐 GET: http://localhost:8080/api/users
✅ GET Response: 200
\`\`\`

o

\`\`\`
❌ GET Error: Connection refused
\`\`\`

Usa estos logs para diagnosticar problemas.

---

## ✅ Todo Funciona Si...

1. Ves las entidades listadas en la app Flutter
2. Puedes crear/editar/eliminar registros
3. No hay errores en consola

¡Listo! Tu app está conectada correctamente 🎉
`;
  }

  private generateConfig(): string {
    return `// ⚠️ CONFIGURACIÓN IMPORTANTE - Selecciona según tu plataforma:

// Para Flutter Web/Windows/macOS/Linux (mismo PC que backend):
const String kApiBaseUrl = "http://localhost:8080";

// Para Android Emulator (descomenta esta línea):
// const String kApiBaseUrl = "http://10.0.2.2:8080";

// Para dispositivo físico (reemplaza con la IP de tu PC):
// const String kApiBaseUrl = "http://192.168.1.100:8080";

// 📝 Nota: El backend debe estar corriendo antes de usar la app
// 📝 Para dispositivos físicos, tu teléfono y PC deben estar en la misma WiFi
`;
  }

  private generateResult(): string {
    return `sealed class Result<T> {
  const Result();
}
class Ok<T> extends Result<T> { final T data; const Ok(this.data); }
class Err<T> extends Result<T> { final String message; const Err(this.message); }
`;
  }

  private generateApiClient(): string {
    return `import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config.dart';
import 'result.dart';

class ApiClient {
  final http.Client _client;
  ApiClient({http.Client? client}) : _client = client ?? http.Client();

  Future<Result<dynamic>> getJson(String path) async {
    try {
      final uri = Uri.parse("\$kApiBaseUrl\$path");
      print('🌐 GET: \$uri');
      final res = await _client.get(
        uri, 
        headers: {'Accept': 'application/json'}
      ).timeout(
        const Duration(seconds: 10),
        onTimeout: () => throw Exception('Timeout: No se pudo conectar al servidor. Verifica que el backend esté corriendo en \$kApiBaseUrl'),
      );
      
      print('✅ GET Response: \${res.statusCode}');
      
      if (res.statusCode >= 200 && res.statusCode < 300) {
        return Ok(jsonDecode(res.body));
      }
      return Err("GET \${res.statusCode}: \${res.body}");
    } catch (e) {
      print('❌ GET Error: \$e');
      return Err("Error de conexión: \$e\\n\\nVerifica:\\n- Backend corriendo en \$kApiBaseUrl\\n- URL correcta en lib/config.dart");
    }
  }

  Future<Result<dynamic>> postJson(String path, Map<String, dynamic> body) async {
    try {
      final uri = Uri.parse("\$kApiBaseUrl\$path");
      print('🌐 POST: \$uri');
      print('📤 Body: \${jsonEncode(body)}');
      
      final res = await _client.post(
        uri,
        headers: {'Content-Type': 'application/json','Accept':'application/json'},
        body: jsonEncode(body),
      ).timeout(
        const Duration(seconds: 10),
        onTimeout: () => throw Exception('Timeout: No se pudo conectar al servidor'),
      );
      
      print('✅ POST Response: \${res.statusCode}');
      
      if (res.statusCode >= 200 && res.statusCode < 300) {
        return Ok(jsonDecode(res.body));
      }
      return Err("POST \${res.statusCode}: \${res.body}");
    } catch (e) {
      print('❌ POST Error: \$e');
      return Err("Error de conexión: \$e");
    }
  }

  Future<Result<dynamic>> putJson(String path, Map<String, dynamic> body) async {
    try {
      final uri = Uri.parse("\$kApiBaseUrl\$path");
      print('🌐 PUT: \$uri');
      print('📤 Body: \${jsonEncode(body)}');
      
      final res = await _client.put(
        uri,
        headers: {'Content-Type': 'application/json','Accept':'application/json'},
        body: jsonEncode(body),
      ).timeout(
        const Duration(seconds: 10),
        onTimeout: () => throw Exception('Timeout: No se pudo conectar al servidor'),
      );
      
      print('✅ PUT Response: \${res.statusCode}');
      
      if (res.statusCode >= 200 && res.statusCode < 300) {
        return Ok(jsonDecode(res.body));
      }
      return Err("PUT \${res.statusCode}: \${res.body}");
    } catch (e) {
      print('❌ PUT Error: \$e');
      return Err("Error de conexión: \$e");
    }
  }

  Future<Result<void>> delete(String path) async {
    try {
      final uri = Uri.parse("\$kApiBaseUrl\$path");
      print('🌐 DELETE: \$uri');
      
      final res = await _client.delete(
        uri, 
        headers: {'Accept': 'application/json'}
      ).timeout(
        const Duration(seconds: 10),
        onTimeout: () => throw Exception('Timeout: No se pudo conectar al servidor'),
      );
      
      print('✅ DELETE Response: \${res.statusCode}');
      
      if (res.statusCode >= 200 && res.statusCode < 300) {
        return Ok(null);
      }
      return Err("DELETE \${res.statusCode}: \${res.body}");
    } catch (e) {
      print('❌ DELETE Error: \$e');
      return Err("Error de conexión: \$e");
    }
  }
}
`;
  }

  private generateAppScaffold(): string {
    return `import 'package:flutter/material.dart';

class AppScaffold extends StatelessWidget {
  final String title;
  final Widget child;
  final List<Widget>? actions;
  const AppScaffold({super.key, required this.title, required this.child, this.actions});

    @override
    Widget build(BuildContext context) {
      return Scaffold(
        appBar: AppBar(title: Text(title), actions: actions),
        body: SafeArea(child: Padding(
          padding: const EdgeInsets.all(12.0),
          child: child,
        )),
      );
    }
}
`;
  }

  // ===== NUEVO: Home Page =====
  private generateHomePage(): string {
    const tiles = this.classes
      .map((c) => {
        const pas = this.toPascal(c.name);
        const base = this.toSnake(pas);
        const title = pas;
        const route = `'/` + base + `List'`;
        return `{ 'title': '${title}', 'route': ${route} }`;
      })
      .join(",\n    ");

    return `import 'package:flutter/material.dart';
import '../widgets/app_scaffold.dart';

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    final items = <Map<String, String>>[
      ${tiles}
    ];

    return AppScaffold(
      title: 'Inicio',
      child: items.isEmpty
          ? const Center(child: Text('No hay entidades definidas'))
          : GridView.builder(
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 1.2,
              ),
              itemCount: items.length,
              itemBuilder: (_, i) {
                final it = items[i];
                return _EntityCard(
                  title: it['title']!,
                  onTap: () => Navigator.pushNamed(context, it['route']!),
                );
              },
            ),
    );
  }
}

class _EntityCard extends StatelessWidget {
  final String title;
  final VoidCallback onTap;

  const _EntityCard({required this.title, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 2,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Icon(Icons.folder, size: 48),
              Text(
                title,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: const [
                  Icon(Icons.list_alt, size: 18),
                  SizedBox(width: 6),
                  Text('Ver listado'),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
`;
  }

  private generateRoutes(): string {
    const routesEntities = this.classes
      .map((c) => {
        const pas = this.toPascal(c.name);
        const base = this.toSnake(pas);
        return `'/${base}List': (c) => const ${pas}ListPage(),
'/${base}Form': (c) => const ${pas}FormPage(),
'/${base}Detail': (c) => const ${pas}DetailPage(),`;
      })
      .join("\n      ");

    const importsEntities = this.classes
      .map((c) => {
        const pas = this.toPascal(c.name);
        const base = this.toSnake(pas);
        return `import 'screens/${base}/${base}_list_page.dart';
import 'screens/${base}/${base}_form_page.dart';
import 'screens/${base}/${base}_detail_page.dart';`;
      })
      .join("\n");

    return `${importsEntities}
import 'package:flutter/material.dart';
import 'screens/home_page.dart';

Map<String, WidgetBuilder> appRoutes() => {
      '/': (c) => const HomePage(),
      ${routesEntities}
    };
`;
  }

  private generateMain(): string {
    return `import 'package:flutter/material.dart';
import 'routes.dart';

void main() {
  runApp(const UmlCrudApp());
}

class UmlCrudApp extends StatelessWidget {
  const UmlCrudApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'UML CRUD',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo),
        useMaterial3: true,
      ),
      routes: appRoutes(),
      initialRoute: '/',
    );
  }
}
`;
  }

  // ===== Models/Services/Screens =====
  private generateModel(cls: ClassDefinition): string {
    const className = this.toPascal(cls.name);
    const fields: string[] = [];
    const ctorParams: string[] = [];
    const fromMapLines: string[] = [];
    const toMapLines: string[] = [];

    const used = new Set<string>();
    used.add("id");
    const attrs = cls.attributes.map((a, i) => this.parseAttribute(a, i));

    // id
    fields.push(`  final int? id;`);
    ctorParams.push(`this.id,`);
    fromMapLines.push(
      `      id: map['id'] is int ? map['id'] as int : (map['id'] == null ? null : int.tryParse(map['id'].toString())),`
    );
    toMapLines.push(`      'id': id,`);

    // Atributos normales
    attrs.forEach(({ type, name }) => {
      if (name.toLowerCase() === "id" || used.has(name)) return;
      used.add(name);
      fields.push(`  final ${type}? ${name};`);
      ctorParams.push(`this.${name},`);
      fromMapLines.push(`      ${name}: map['${name}'],`);
      toMapLines.push(`      '${name}': ${name},`);
    });

    // ✅ AGREGAR CAMPOS DE FK SEGÚN RELACIONES
    this.processedRelations
      .filter((r) => r.source === className || r.target === className)
      .forEach((r) => {
        const isSource = r.source === className;
        const otherClass = isSource ? r.target : r.source;
        const otherVar = this.toCamel(otherClass);

        // Determinar si este lado tiene la FK
        const hasForeignKey =
          (isSource && r.ownerSide === "source") ||
          (!isSource && r.ownerSide === "target");

        if (!hasForeignKey) return; // No tiene FK, saltar

        // Nombre del campo FK
        const fkFieldName = `${otherVar}Id`;

        // Evitar duplicados
        if (used.has(fkFieldName)) return;
        used.add(fkFieldName);

        // Agregar campo FK (int? para referencia a otra entidad)
        fields.push(`  final int? ${fkFieldName}; // FK → ${otherClass}`);
        ctorParams.push(`this.${fkFieldName},`);
        fromMapLines.push(
          `      ${fkFieldName}: map['${fkFieldName}'] is int ? map['${fkFieldName}'] as int : (map['${fkFieldName}'] == null ? null : int.tryParse(map['${fkFieldName}'].toString())),`
        );
        toMapLines.push(`      '${fkFieldName}': ${fkFieldName},`);
      });

    return `class ${className} {
${fields.join("\n")}

  const ${className}({
    ${ctorParams.join("\n    ")}
  });

  factory ${className}.fromMap(Map<String, dynamic> map) => ${className}(
${fromMapLines.join("\n")}
  );

  Map<String, dynamic> toMap() => {
${toMapLines.join("\n")}
  };
}
`;
  }

  private generateService(cls: ClassDefinition): string {
    const className = this.toPascal(cls.name);
    const fileBase = this.toSnake(className);
    const endpoint = `/api/${this.toPlural(this.toCamel(className))}`;

    return `import '../core/api_client.dart';
import '../core/result.dart';
import '../models/${fileBase}.dart';

class ${className}Service {
  final ApiClient _api;
  ${className}Service(this._api);

  Future<Result<List<${className}>>> getAll() async {
    final res = await _api.getJson('${endpoint}');
    if (res is Ok) {
      final data = res.data;
      if (data is List) {
        return Ok(data.map((e) => ${className}.fromMap(e as Map<String, dynamic>)).toList());
      }
      return Err('Formato inesperado en GET all');
    }
    return Err((res as Err).message);
  }

  Future<Result<${className}>> getById(int id) async {
    final res = await _api.getJson('${endpoint}/\$id');
    if (res is Ok) {
      final data = res.data;
      if (data is Map<String, dynamic>) {
        return Ok(${className}.fromMap(data));
      }
      return Err('Formato inesperado en GET by id');
    }
    return Err((res as Err).message);
  }

  Future<Result<${className}>> create(${className} model) async {
    final res = await _api.postJson('${endpoint}', model.toMap());
    if (res is Ok) {
      final data = res.data;
      if (data is Map<String, dynamic>) {
        return Ok(${className}.fromMap(data));
      }
      return Err('Formato inesperado en POST');
    }
    return Err((res as Err).message);
  }

  Future<Result<${className}>> update(int id, ${className} model) async {
    final res = await _api.putJson('${endpoint}/\$id', model.toMap());
    if (res is Ok) {
      final data = res.data;
      if (data is Map<String, dynamic>) {
        return Ok(${className}.fromMap(data));
      }
      return Err('Formato inesperado en PUT');
    }
    return Err((res as Err).message);
  }

  Future<Result<void>> delete(int id) async {
    final res = await _api.delete('${endpoint}/\$id');
    if (res is Ok) return Ok(null);
    return Err((res as Err).message);
  }
}
`;
  }

  private generateListPage(cls: ClassDefinition): string {
    const className = this.toPascal(cls.name);
    const fileBase = this.toSnake(className);
    const varName = this.toCamel(className);
    const sampleField = this.toCamel(
      (
        cls.attributes.find((a) => !a.toLowerCase().startsWith("id")) ||
        "nombre:String"
      ).split(":")[0]
    );

    return `import 'package:flutter/material.dart';
import '../../widgets/app_scaffold.dart';
import '../../core/api_client.dart';
import '../../core/result.dart';
import '../../models/${fileBase}.dart';
import '../../services/${fileBase}_service.dart';

class ${className}ListPage extends StatefulWidget {
  const ${className}ListPage({super.key});

  @override
  State<${className}ListPage> createState() => _${className}ListPageState();
}

class _${className}ListPageState extends State<${className}ListPage> {
  late final ${className}Service _service;
  List<${className}> _items = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _service = ${className}Service(ApiClient());
    _fetch();
  }

  Future<void> _fetch() async {
    setState(() { _loading = true; _error = null; });
    final res = await _service.getAll();
    if (res is Ok<List<${className}>>) {
      setState(() { _items = res.data; _loading = false; });
    } else {
      setState(() { _error = (res as Err).message; _loading = false; });
    }
  }

  void _goCreate() async {
    final result = await Navigator.pushNamed(context, '/${fileBase}Form');
    if (result == true) _fetch(); // Recargar solo si se guardó exitosamente
  }

  void _goEdit(${className} ${varName}) async {
    final result = await Navigator.pushNamed(
      context, 
      '/${fileBase}Form',
      arguments: ${varName}, // Pasar el objeto completo
    );
    if (result == true) _fetch(); // Recargar solo si se guardó exitosamente
  }

  void _goDetail(${className} ${varName}) {
    Navigator.pushNamed(
      context, 
      '/${fileBase}Detail',
      arguments: ${varName}.id,
    );
  }

  Future<void> _delete(${className} ${varName}) async {
    if (${varName}.id == null) return;
    
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('⚠️ Confirmar eliminación'),
        content: Text('¿Estás seguro de eliminar "\${${varName}.${sampleField} ?? 'este registro'}"?\\n\\nEsta acción no se puede deshacer.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false), 
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true), 
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Eliminar'),
          ),
        ],
      ),
    );
    
    if (ok != true) return;
    
    final res = await _service.delete(${varName}.id!);
    if (res is Ok<void>) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('✅ Eliminado exitosamente'),
            backgroundColor: Colors.green,
          ),
        );
      }
      _fetch();
    } else {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('❌ Error: \${(res as Err).message}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final title = '${className}';
    
    if (_loading) {
      return AppScaffold(
        title: title, 
        actions: [
          IconButton(
            onPressed: _goCreate, 
            icon: const Icon(Icons.add),
            tooltip: 'Crear nuevo',
          ),
        ],
        child: const Center(child: CircularProgressIndicator()),
      );
    }

    if (_error != null) {
      return AppScaffold(
        title: title, 
        actions: [
          IconButton(
            onPressed: _goCreate, 
            icon: const Icon(Icons.add),
            tooltip: 'Crear nuevo',
          ),
        ],
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 64, color: Colors.red),
              const SizedBox(height: 16),
              Text('Error: \$_error', textAlign: TextAlign.center),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: _fetch,
                icon: const Icon(Icons.refresh),
                label: const Text('Reintentar'),
              ),
            ],
          ),
        ),
      );
    }

    if (_items.isEmpty) {
      return AppScaffold(
        title: title, 
        actions: [
          IconButton(
            onPressed: _goCreate, 
            icon: const Icon(Icons.add),
            tooltip: 'Crear nuevo',
          ),
        ],
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.inbox_outlined, size: 64, color: Colors.grey),
              const SizedBox(height: 16),
              const Text('No hay datos', style: TextStyle(fontSize: 18)),
              const SizedBox(height: 8),
              const Text('Crea tu primer registro', style: TextStyle(color: Colors.grey)),
              const SizedBox(height: 24),
              FilledButton.icon(
                onPressed: _goCreate,
                icon: const Icon(Icons.add),
                label: const Text('Crear ${className}'),
              ),
            ],
          ),
        ),
      );
    }

    return AppScaffold(
      title: title,
      actions: [
        IconButton(
          onPressed: _fetch,
          icon: const Icon(Icons.refresh),
          tooltip: 'Actualizar',
        ),
        IconButton(
          onPressed: _goCreate, 
          icon: const Icon(Icons.add),
          tooltip: 'Crear nuevo',
        ),
      ],
      child: Column(
        children: [
          // Contador de items
          Container(
            padding: const EdgeInsets.all(12),
            color: Theme.of(context).colorScheme.surfaceVariant,
            child: Row(
              children: [
                const Icon(Icons.list, size: 20),
                const SizedBox(width: 8),
                Text(
                  '\${_items.length} registro\${_items.length == 1 ? '' : 's'}',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                const Spacer(),
                FilledButton.icon(
                  onPressed: _goCreate,
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('Nuevo'),
                  style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          // Lista
          Expanded(
            child: RefreshIndicator(
              onRefresh: _fetch,
              child: ListView.separated(
                itemCount: _items.length,
                separatorBuilder: (_, __) => const Divider(height: 1),
                itemBuilder: (ctx, i) {
                  final it = _items[i];
                  return Card(
                    margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    child: ListTile(
                      leading: CircleAvatar(
                        child: Text('\${it.id ?? "?"}'),
                      ),
                      title: Text(
                        it.${sampleField}?.toString() ?? '(${className} \${it.id})',
                        style: const TextStyle(fontWeight: FontWeight.w500),
                      ),
                      subtitle: Text('ID: \${it.id ?? "-"}'),
                      onTap: () => _goDetail(it),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          IconButton(
                            onPressed: () => _goEdit(it), 
                            icon: const Icon(Icons.edit, color: Colors.blue),
                            tooltip: 'Editar',
                          ),
                          IconButton(
                            onPressed: () => _delete(it), 
                            icon: const Icon(Icons.delete, color: Colors.red),
                            tooltip: 'Eliminar',
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}
`;
  }

  private generateFormPage(cls: ClassDefinition): string {
    const className = this.toPascal(cls.name);
    const fileBase = this.toSnake(className);
    const attrs = cls.attributes
      .map((a, i) => this.parseAttribute(a, i))
      .filter(({ name }) => name.toLowerCase() !== "id");

    // ✅ IDENTIFICAR FK FIELDS CON MÁS DETALLES
    const fkFields: Array<{
      fkName: string;
      relatedClass: string;
      relatedFileBase: string;
      relatedVarName: string;
    }> = [];
    this.processedRelations
      .filter((r) => r.source === className || r.target === className)
      .forEach((r) => {
        const isSource = r.source === className;
        const hasForeignKey =
          (isSource && r.ownerSide === "source") ||
          (!isSource && r.ownerSide === "target");

        if (hasForeignKey) {
          const otherClass = isSource ? r.target : r.source;
          const otherVar = this.toCamel(otherClass);
          const fkFieldName = `${otherVar}Id`;
          const relatedFileBase = this.toSnake(otherClass);
          fkFields.push({
            fkName: fkFieldName,
            relatedClass: otherClass,
            relatedFileBase,
            relatedVarName: otherVar,
          });
        }
      });

    const ctrls = attrs
      .map((a) => `final _${a.name}Ctrl = TextEditingController();`)
      .join("\n  ");

    // ✅ STATE PARA DROPDOWNS DE FK
    const fkStateVars = fkFields
      .map((fk) => `List<${fk.relatedClass}>? _${fk.relatedVarName}List;`)
      .join("\n  ");

    const fkSelectedVars = fkFields
      .map((fk) => `int? _selected${this.toPascal(fk.fkName)};`)
      .join("\n  ");

    const fkServices = fkFields
      .map(
        (fk) =>
          `late final ${fk.relatedClass}Service _${fk.relatedVarName}Service;`
      )
      .join("\n  ");

    const dispose = attrs
      .map((a) => `_${a.name}Ctrl.dispose();`)
      .join("\n    ");

    const setInit = attrs
      .map(
        (a) => `_${a.name}Ctrl.text = (_initial?.${a.name} ?? '').toString();`
      )
      .join("\n    ");

    const fieldWidgets = attrs
      .map(
        (a) =>
          `TextFormField(
            controller: _${a.name}Ctrl,
            decoration: InputDecoration(
              labelText: '${a.name}',
              border: const OutlineInputBorder(),
              filled: true,
            ),
            validator: (v) => (v == null || v.isEmpty) ? 'Campo requerido' : null,
          )`
      )
      .join(",\n          const SizedBox(height: 12),\n          ");

    // ✅ DROPDOWNS PARA FK EN LUGAR DE TextFormField
    const fkFieldWidgets = fkFields
      .map((fk) => {
        // Buscar el primer atributo String de la clase relacionada para mostrar
        const relatedClass = this.classes.find(
          (c) => this.toPascal(c.name) === fk.relatedClass
        );
        const displayAttr = relatedClass?.attributes
          .map((a, i) => this.parseAttribute(a, i))
          .find(
            ({ name, type }) => name.toLowerCase() !== "id" && type === "String"
          );
        const displayField = displayAttr ? displayAttr.name : "id";

        return `// Dropdown para ${fk.fkName} (FK → ${fk.relatedClass})
          DropdownButtonFormField<int>(
            value: _selected${this.toPascal(fk.fkName)},
            decoration: InputDecoration(
              labelText: '${fk.relatedClass}',
              border: const OutlineInputBorder(),
              filled: true,
              prefixIcon: const Icon(Icons.link),
              hintText: 'Selecciona ${fk.relatedClass}',
            ),
            items: _${fk.relatedVarName}List?.map((item) {
              final displayText = item.${displayField}?.toString() ?? 'ID: \${item.id}';
              return DropdownMenuItem<int>(
                value: item.id,
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 12,
                      child: Text('\${item.id ?? "?"}', style: const TextStyle(fontSize: 10)),
                    ),
                    const SizedBox(width: 8),
                    Expanded(child: Text(displayText)),
                  ],
                ),
              );
            }).toList() ?? [],
            onChanged: (val) {
              setState(() {
                _selected${this.toPascal(fk.fkName)} = val;
              });
            },
            validator: (v) => v == null ? 'Selecciona una opción' : null,
            hint: _${fk.relatedVarName}List == null 
              ? const Row(
                  children: [
                    SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                    SizedBox(width: 8),
                    Text('Cargando...'),
                  ],
                )
              : null,
          )`;
      })
      .join(",\n          const SizedBox(height: 12),\n          ");

    const fieldBlock =
      attrs.length || fkFields.length
        ? `${fieldWidgets}${
            attrs.length && fkFields.length
              ? ",\n          const SizedBox(height: 12),\n          "
              : ""
          }${fkFieldWidgets}${
            attrs.length || fkFields.length
              ? ",\n          const SizedBox(height: 12),"
              : ""
          }`
        : ``;

    const toNumber = (a: ParsedAttr) =>
      a.type === "int" || a.type === "double"
        ? a.type === "int"
          ? `int.tryParse(_${a.name}Ctrl.text)`
          : `double.tryParse(_${a.name}Ctrl.text)`
        : `_${a.name}Ctrl.text`;

    const mapLines = attrs
      .map((a) => `'${a.name}': ${toNumber(a)},`)
      .join("\n      ");

    // ✅ USAR VALORES SELECCIONADOS EN DROPDOWN
    const fkMapLines = fkFields
      .map((fk) => `'${fk.fkName}': _selected${this.toPascal(fk.fkName)},`)
      .join("\n      ");

    const allMapLines =
      mapLines && fkMapLines
        ? `${mapLines}\n      ${fkMapLines}`
        : mapLines || fkMapLines;

    // ✅ IMPORTS PARA SERVICIOS DE ENTIDADES RELACIONADAS
    const fkImports = fkFields
      .map(
        (fk) =>
          `import '../../models/${fk.relatedFileBase}.dart';
import '../../services/${fk.relatedFileBase}_service.dart';`
      )
      .join("\n");

    // ✅ INICIALIZAR SERVICIOS EN initState
    const fkServiceInits = fkFields
      .map(
        (fk) =>
          `_${fk.relatedVarName}Service = ${fk.relatedClass}Service(ApiClient());`
      )
      .join("\n    ");

    // ✅ CARGAR DATOS DE DROPDOWN
    const fkLoadData = fkFields
      .map((fk) => `_load${this.toPascal(fk.relatedVarName)}();`)
      .join("\n    ");

    // ✅ MÉTODOS PARA CARGAR OPCIONES DE DROPDOWN
    const fkLoadMethods = fkFields
      .map(
        (fk) => `
  Future<void> _load${this.toPascal(fk.relatedVarName)}() async {
    final res = await _${fk.relatedVarName}Service.getAll();
    if (res is Ok<List<${fk.relatedClass}>>) {
      setState(() {
        _${fk.relatedVarName}List = res.data;
      });
    }
  }`
      )
      .join("\n");

    // ✅ INICIALIZAR VALORES SELECCIONADOS EN didChangeDependencies
    const fkInitSelected = fkFields
      .map(
        (fk) => `_selected${this.toPascal(fk.fkName)} = _initial?.${fk.fkName};`
      )
      .join("\n        ");

    return `import 'package:flutter/material.dart';
import '../../widgets/app_scaffold.dart';
import '../../core/api_client.dart';
import '../../core/result.dart';
import '../../models/${fileBase}.dart';
import '../../services/${fileBase}_service.dart';
${fkImports}

class ${className}FormPage extends StatefulWidget {
  const ${className}FormPage({super.key});

  @override
  State<${className}FormPage> createState() => _${className}FormPageState();
}

class _${className}FormPageState extends State<${className}FormPage> {
  final _formKey = GlobalKey<FormState>();
  late final ${className}Service _service;
  ${className}? _initial;
  bool _loading = false;

  // Controllers para campos normales
  ${ctrls}

  // State para FK dropdowns
  ${fkStateVars}
  ${fkSelectedVars}
  ${fkServices}

  @override
  void initState() {
    super.initState();
    _service = ${className}Service(ApiClient());
    ${fkServiceInits}
    ${fkLoadData}
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Obtener el argumento pasado desde la navegación (solo la primera vez)
    if (_initial == null) {
      final args = ModalRoute.of(context)?.settings.arguments;
      if (args is ${className}) {
        _initial = args;
        ${setInit}
        ${fkInitSelected}
      }
    }
  }

  @override
  void dispose() {
    ${dispose}
    super.dispose();
  }
${fkLoadMethods}

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() { _loading = true; });

    final map = {
      'id': _initial?.id,
      ${allMapLines}
    };
    final model = ${className}.fromMap(map);
    final res = _initial?.id == null
      ? await _service.create(model)
      : await _service.update(_initial!.id!, model);

    setState(() { _loading = false; });

    if (res is Ok<${className}>) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('✅ Guardado exitosamente'),
            backgroundColor: Colors.green,
          ),
        );
        Navigator.pop(context, true); // Retorna true para indicar éxito
      }
    } else {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('❌ Error: \${(res as Err).message}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isEditing = _initial?.id != null;
    return AppScaffold(
      title: isEditing ? 'Editar ${className} #\${_initial!.id}' : 'Crear ${className}',
      child: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
          ${fieldBlock}
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: _loading ? null : _save,
              icon: _loading 
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : Icon(isEditing ? Icons.save : Icons.add),
              label: Text(_loading ? 'Guardando...' : (isEditing ? 'Guardar Cambios' : 'Crear')),
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: _loading ? null : () => Navigator.pop(context),
              icon: const Icon(Icons.cancel),
              label: const Text('Cancelar'),
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
`;
  }

  private generateDetailPage(cls: ClassDefinition): string {
    const className = this.toPascal(cls.name);
    const fileBase = this.toSnake(className);
    const rows = cls.attributes
      .map((a, i) => this.parseAttribute(a, i))
      .map(
        (a) =>
          `_DetailRow(label: '${a.name}', value: item.${a.name}?.toString() ?? '-'),`
      )
      .join("\n                ");

    return `import 'package:flutter/material.dart';
import '../../widgets/app_scaffold.dart';
import '../../core/api_client.dart';
import '../../core/result.dart';
import '../../models/${fileBase}.dart';
import '../../services/${fileBase}_service.dart';

class ${className}DetailPage extends StatefulWidget {
  const ${className}DetailPage({super.key});

  @override
  State<${className}DetailPage> createState() => _${className}DetailPageState();
}

class _${className}DetailPageState extends State<${className}DetailPage> {
  late final ${className}Service _service;
  ${className}? _item;
  bool _loading = true;
  String? _error;
  int? _id;

  @override
  void initState() {
    super.initState();
    _service = ${className}Service(ApiClient());
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_id == null) {
      final args = ModalRoute.of(context)?.settings.arguments;
      if (args is int) {
        _id = args;
        _fetch();
      }
    }
  }

  Future<void> _fetch() async {
    if (_id == null) { 
      setState(() { _error = 'ID inválido'; _loading = false; }); 
      return; 
    }
    setState(() { _loading = true; _error = null; });
    final res = await _service.getById(_id!);
    if (res is Ok<${className}>) {
      setState(() { _item = res.data; _loading = false; });
    } else {
      setState(() { _error = (res as Err).message; _loading = false; });
    }
  }

  void _goEdit() async {
    final result = await Navigator.pushNamed(
      context, 
      '/${fileBase}Form',
      arguments: _item,
    );
    if (result == true) _fetch(); // Recargar si se guardó
  }

  Future<void> _delete() async {
    if (_item?.id == null) return;
    
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('⚠️ Confirmar eliminación'),
        content: const Text('¿Estás seguro de eliminar este registro?\\n\\nEsta acción no se puede deshacer.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false), 
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true), 
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Eliminar'),
          ),
        ],
      ),
    );
    
    if (ok != true) return;
    
    final res = await _service.delete(_item!.id!);
    if (res is Ok<void>) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('✅ Eliminado exitosamente'),
            backgroundColor: Colors.green,
          ),
        );
        Navigator.pop(context); // Volver al listado
      }
    } else {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('❌ Error: \${(res as Err).message}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return AppScaffold(
        title: '${className}',
        child: const Center(child: CircularProgressIndicator()),
      );
    }

    if (_error != null) {
      return AppScaffold(
        title: '${className}',
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 64, color: Colors.red),
              const SizedBox(height: 16),
              Text('Error: \$_error', textAlign: TextAlign.center),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: _fetch,
                icon: const Icon(Icons.refresh),
                label: const Text('Reintentar'),
              ),
            ],
          ),
        ),
      );
    }

    if (_item == null) {
      return AppScaffold(
        title: '${className}',
        child: const Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.search_off, size: 64, color: Colors.grey),
              SizedBox(height: 16),
              Text('No encontrado', style: TextStyle(fontSize: 18)),
            ],
          ),
        ),
      );
    }

    final item = _item!;
    return AppScaffold(
      title: '${className} #\${item.id ?? '-'}',
      actions: [
        IconButton(
          onPressed: _goEdit,
          icon: const Icon(Icons.edit),
          tooltip: 'Editar',
        ),
        IconButton(
          onPressed: _delete,
          icon: const Icon(Icons.delete),
          tooltip: 'Eliminar',
        ),
      ],
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Header card
            Card(
              margin: const EdgeInsets.all(16),
              color: Theme.of(context).colorScheme.primaryContainer,
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  children: [
                    Icon(
                      Icons.folder_open,
                      size: 64,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                    const SizedBox(height: 12),
                    Text(
                      '${className}',
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'ID: \${item.id ?? '-'}',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Theme.of(context).colorScheme.onPrimaryContainer.withOpacity(0.7),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            // Detalles
            Card(
              margin: const EdgeInsets.symmetric(horizontal: 16),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Detalles',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const Divider(height: 24),
                    ${rows}
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            // Botones de acción
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  FilledButton.icon(
                    onPressed: _goEdit,
                    icon: const Icon(Icons.edit),
                    label: const Text('Editar'),
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                    ),
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: _delete,
                    icon: const Icon(Icons.delete),
                    label: const Text('Eliminar'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.red,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}

// Widget helper para mostrar filas de detalles
class _DetailRow extends StatelessWidget {
  final String label;
  final String value;

  const _DetailRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: const TextStyle(
                fontWeight: FontWeight.bold,
                color: Colors.grey,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontSize: 16),
            ),
          ),
        ],
      ),
    );
  }
}
`;
  }
}
