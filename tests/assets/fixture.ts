import { newProject, projectSchema, type Project } from '../../src/domain/model';

/** Stable test identities only. Production identity allocation stays with the integrator. */
export function fixtureProject(): Project {
  const project=newProject();let serial=1;
  const id=()=>`10000000-0000-4000-8000-${String(serial++).padStart(12,'0')}`;
  project.id=id();
  for(const variant of project.variants) {
    variant.id=id();variant.design.id=id();
    variant.design.components.forEach(component=>component.id=id());
    variant.design.objects.forEach(object=>object.id=id());
  }
  return projectSchema.parse(project);
}
