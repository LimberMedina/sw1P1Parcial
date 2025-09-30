import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class DiagramNode {
  /* estructura abierta */
}
class DiagramEdge {
  /* estructura abierta */
}

export class UpsertDiagramDto {
  @IsArray()
  nodes: any[];

  @IsArray()
  edges: any[];

  @IsOptional()
  @IsString()
  updatedAt?: string;
}
