// src/uml/codegen/JavaSpringGenerator.ts

export interface ClassDefinition {
  name: string;
  attributes: string[]; // acepta "nombre: Tipo" | "Tipo nombre" | "nombre"
  methods: string[]; // no usado aquí, pero se mantiene para futuro
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

type ParsedAttr = { type: string; name: string };

export class JavaSpringGenerator {
  private classes: ClassDefinition[] = [];
  private relations: RelationDefinition[] = [];
  private packageName: string;

  constructor(packageName: string = "com.example") {
    this.packageName = packageName;
  }

  addClass(cls: ClassDefinition) {
    this.classes.push(cls);
  }

  addRelation(relation: RelationDefinition) {
    this.relations.push(relation);
  }

  // ===== Utils =====
  private safeStr(s: unknown, fallback = ""): string {
    const v = String(s ?? "").trim();
    return v || fallback;
  }

  private toCamelCase(str: string): string {
    const s = this.safeStr(str);
    if (!s) return "value";
    const out = s.charAt(0).toLowerCase() + s.slice(1);
    const reserved = [
      "class",
      "interface",
      "abstract",
      "public",
      "private",
      "protected",
      "static",
      "final",
      "volatile",
      "transient",
      "synchronized",
      "native",
      "strictfp",
    ];
    return reserved.includes(out) ? `${out}Entity` : out;
  }

  private toPascal(str: string): string {
    const s = this.safeStr(str);
    if (!s) return "Value";
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  private toPlural(str: string): string {
    const s = this.safeStr(str);
    if (!s) return "items";
    if (/(s|sh|ch|x|z)$/.test(s)) return s + "es";
    if (/[^aeiou]y$/.test(s)) return s.slice(0, -1) + "ies";
    if (s.endsWith("f")) return s.slice(0, -1) + "ves";
    if (s.endsWith("fe")) return s.slice(0, -2) + "ves";
    return s + "s";
  }

  private sanitizeIdentifier(raw: string, fallback: string): string {
    let s = this.safeStr(raw, fallback).replace(/[^\p{L}\p{N}_$]/gu, "_");
    if (/^\d/.test(s)) s = "_" + s;
    return s;
  }

  private isJavaType(token: string): boolean {
    const t = token.trim();
    const primitives = [
      "int",
      "long",
      "double",
      "float",
      "boolean",
      "byte",
      "short",
      "char",
      "void",
    ];
    const common = [
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
    ];
    return primitives.includes(t) || common.includes(t) || /^[A-Z]\w*$/.test(t);
  }

  /** Acepta: "nombre: Tipo" | "Tipo nombre" | "nombre" */
  private parseAttribute(line: string, index: number): ParsedAttr {
    const raw = this.safeStr(line);
    if (!raw) return { type: "String", name: `field_${index + 1}` };

    // 1) "nombre: Tipo"
    const colonIdx = raw.indexOf(":");
    if (colonIdx !== -1) {
      const name = this.sanitizeIdentifier(
        raw.slice(0, colonIdx).trim(),
        `field_${index + 1}`
      );
      const type = this.toPascal(
        this.safeStr(raw.slice(colonIdx + 1), "String")
      );
      return { type, name };
    }

    // 2) "Tipo nombre"
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length === 2 && this.isJavaType(parts[0])) {
      const type = parts[0];
      const name = this.sanitizeIdentifier(parts[1], `field_${index + 1}`);
      return { type, name };
    }

    // 3) "nombre" => String
    const name = this.sanitizeIdentifier(raw, `field_${index + 1}`);
    return { type: "String", name };
  }

  // ====== Code gen ======
  private generateImports() {
    return `package ${this.packageName}.model;

import jakarta.persistence.*;
import lombok.*;
import java.util.*;
import com.fasterxml.jackson.annotation.*;

`;
  }

  private generateFields(cls: ClassDefinition): string {
    const lines: string[] = [];

    // atributos "simples"
    cls.attributes.forEach((a, i) => {
      const { type, name } = this.parseAttribute(a, i);
      lines.push(
        `    @Column(name = "${name.toLowerCase()}")
    private ${type} ${name};`
      );
    });

    // relaciones para ESTA clase
    const className = cls.name;
    const thisVar = this.toCamelCase(className);

    this.relations
      .filter((r) => r.source === className || r.target === className)
      .forEach((r) => {
        const isSource = r.source === className;
        const otherClass = isSource ? r.target : r.source;
        const otherVar = this.toCamelCase(otherClass);
        const collNameFromOther = this.toPlural(otherVar);

        switch (r.type) {
          case "ONE_TO_ONE": {
            if (isSource) {
              // dueño en source
              lines.push(
                `    @OneToOne(cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    @JoinColumn(name = "${this.toCamelCase(otherClass)}_id")
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private ${otherClass} ${otherVar};`
              );
            } else if (r.bidirectional) {
              // lado inverso en target
              lines.push(
                `    @OneToOne(mappedBy = "${otherVar}", fetch = FetchType.LAZY)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private ${otherClass} ${otherVar};`
              );
            }
            break;
          }

          case "MANY_TO_ONE": {
            if (isSource) {
              // many(source) -> one(target)
              lines.push(
                `    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "${this.toCamelCase(otherClass)}_id")
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private ${otherClass} ${otherVar};`
              );
            } else if (r.bidirectional) {
              // one(target) -> many(source)
              lines.push(
                `    @OneToMany(mappedBy = "${this.toCamelCase(
                  className
                )}", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private Set<${otherClass}> ${collNameFromOther} = new HashSet<>();`
              );
            }
            break;
          }

          case "ONE_TO_MANY": {
            if (isSource) {
              // one(source) -> many(target)
              lines.push(
                `    @OneToMany(mappedBy = "${thisVar}", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private Set<${otherClass}> ${this.toPlural(otherVar)} = new HashSet<>();`
              );
            } else {
              // many(target) -> one(source)
              lines.push(
                `    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "${this.toCamelCase(otherClass)}_id")
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private ${otherClass} ${otherVar};`
              );
            }
            break;
          }

          case "MANY_TO_MANY": {
            if (isSource) {
              const joinTable = `${className.toLowerCase()}_${otherClass.toLowerCase()}`;
              lines.push(
                `    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
        name = "${joinTable}",
        joinColumns = @JoinColumn(name = "${this.toCamelCase(className)}_id"),
        inverseJoinColumns = @JoinColumn(name = "${this.toCamelCase(
          otherClass
        )}_id")
    )
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private Set<${otherClass}> ${this.toPlural(otherVar)} = new HashSet<>();`
              );
            } else if (r.bidirectional) {
              // lado inverso
              lines.push(
                `    @ManyToMany(mappedBy = "${this.toPlural(
                  this.toCamelCase(otherClass)
                )}", fetch = FetchType.LAZY)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private Set<${otherClass}> ${this.toPlural(otherVar)} = new HashSet<>();`
              );
            }
            break;
          }
        }
      });

    return lines.filter(Boolean).join("\n\n");
  }

  private generateClass(cls: ClassDefinition): string {
    const className = this.toPascal(cls.name);
    const varName = this.toCamelCase(className);

    const body = this.generateFields(cls);

    return `${this.generateImports()}
@Entity
@Table(name = "${this.toPlural(className.toLowerCase())}")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ${className} {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

${body ? "\n" + body + "\n" : ""}

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        ${className} ${varName} = (${className}) o;
        return Objects.equals(id, ${varName}.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }

    @Override
    public String toString() {
        return "${className}{id=" + id + "}";
    }
}`;
  }

  generateAll(): Record<string, string> {
    const result: Record<string, string> = {};
    // Entidades
    this.classes.forEach((cls) => {
      result[`${this.toPascal(cls.name)}.java`] = this.generateClass(cls);
    });
    // DTOs
    this.classes.forEach((cls) => {
      result[`${this.toPascal(cls.name)}DTO.java`] = this.generateDTO(cls);
    });
    // Repos
    this.classes.forEach((cls) => {
      result[`${this.toPascal(cls.name)}Repository.java`] =
        this.generateRepository(cls);
    });
    // Services
    this.classes.forEach((cls) => {
      result[`${this.toPascal(cls.name)}Service.java`] =
        this.generateService(cls);
    });
    // Controllers
    this.classes.forEach((cls) => {
      result[`${this.toPascal(cls.name)}Controller.java`] =
        this.generateController(cls);
    });
    return result;
  }

  private generateDTO(cls: ClassDefinition): string {
    const className = this.toPascal(cls.name);
    const fields = cls.attributes
      .map((attr, i) => {
        const { type, name } = this.parseAttribute(attr, i);
        return `    private ${type} ${name};`;
      })
      .filter(Boolean);

    return `package ${this.packageName}.dto;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ${className}DTO {
    private Long id;
${fields.length ? "\n" + fields.join("\n") + "\n" : ""}
}`;
  }

  private generateRepository(cls: ClassDefinition): string {
    const className = this.toPascal(cls.name);
    return `package ${this.packageName}.repository;

import ${this.packageName}.model.${className};
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ${className}Repository extends JpaRepository<${className}, Long> {
}`;
  }

  private generateService(cls: ClassDefinition): string {
    const className = this.toPascal(cls.name);
    const varName = this.toCamelCase(className);
    const repoName = `${className}Repository`;
    const repoVar = `${varName}Repository`;
    const dtoName = `${className}DTO`;

    return `package ${this.packageName}.service;

import ${this.packageName}.dto.${dtoName};
import ${this.packageName}.model.${className};
import ${this.packageName}.repository.${repoName};
import org.modelmapper.ModelMapper;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class ${className}Service {

    private final ${repoName} ${repoVar};
    private final ModelMapper modelMapper;

    public ${className}Service(${repoName} ${repoVar}, ModelMapper modelMapper) {
        this.${repoVar} = ${repoVar};
        this.modelMapper = modelMapper;
    }

    public List<${dtoName}> findAll() {
        return ${repoVar}.findAll().stream()
                .map(e -> modelMapper.map(e, ${dtoName}.class))
                .collect(Collectors.toList());
    }

    public ${dtoName} findById(Long id) {
        ${className} e = ${repoVar}.findById(id)
                .orElseThrow(() -> new RuntimeException("${className} not found with id: " + id));
        return modelMapper.map(e, ${dtoName}.class);
    }

    public ${dtoName} create(${dtoName} dto) {
        ${className} e = modelMapper.map(dto, ${className}.class);
        e.setId(null);
        return modelMapper.map(${repoVar}.save(e), ${dtoName}.class);
    }

    public ${dtoName} update(Long id, ${dtoName} dto) {
        ${className} existing = ${repoVar}.findById(id)
                .orElseThrow(() -> new RuntimeException("${className} not found with id: " + id));
        modelMapper.map(dto, existing);
        existing.setId(id);
        return modelMapper.map(${repoVar}.save(existing), ${dtoName}.class);
    }

    public void delete(Long id) {
        if (!${repoVar}.existsById(id)) throw new RuntimeException("${className} not found with id: " + id);
        ${repoVar}.deleteById(id);
    }
}`;
  }

  private generateController(cls: ClassDefinition): string {
    const className = this.toPascal(cls.name);
    const varName = this.toCamelCase(className);
    const dtoName = `${className}DTO`;
    const basePath = `"/api/${this.toPlural(varName)}"`;

    return `package ${this.packageName}.controller;

import ${this.packageName}.dto.${dtoName};
import ${this.packageName}.service.${className}Service;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping(${basePath})
public class ${className}Controller {

    private final ${className}Service ${varName}Service;

    public ${className}Controller(${className}Service ${varName}Service) {
        this.${varName}Service = ${varName}Service;
    }

    @GetMapping
    public ResponseEntity<List<${dtoName}>> getAll() {
        return ResponseEntity.ok(${varName}Service.findAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<${dtoName}> getById(@PathVariable Long id) {
        try {
            return ResponseEntity.ok(${varName}Service.findById(id));
        } catch (RuntimeException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping
    public ResponseEntity<${dtoName}> create(@RequestBody ${dtoName} dto) {
        return ResponseEntity.ok(${varName}Service.create(dto));
    }

    @PutMapping("/{id}")
    public ResponseEntity<${dtoName}> update(@PathVariable Long id, @RequestBody ${dtoName} dto) {
        try {
            return ResponseEntity.ok(${varName}Service.update(id, dto));
        } catch (RuntimeException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        try {
            ${varName}Service.delete(id);
            return ResponseEntity.noContent().build();
        } catch (RuntimeException e) {
            return ResponseEntity.notFound().build();
        }
    }
}`;
  }
}
