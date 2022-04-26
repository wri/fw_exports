# Forest Watcher Service <NAME>

This repository contains the code for the forest watcher microservices <NAME>.
It deploys a dockerized application on AWS fargate and expose endpoints under the public URL

- fw-api.globalforestwatch.org
- staging-fw-api.globalforestwatch.org
- dev-fw-api.globalforestwatch.org

for production, staging and dev environments correspondingly.

The application itself is written in [Nodejs](https://nodejs.org/). Application code must be located in the `app/src` folder. The Dockerfile should always be place at the root of the repository.

The app is a [Koa v2](https://koajs.com/) application with TypeScript support. Which is structured like so:
```markdown
- app/src               # Source code for the service
    - /models           # Database ORM/ODM models
    - /routes           # Routers for the service
    - /serializers      # Serialisers for response object
    - /services         # Reusable services
    - /validators       # Validators for request objects
    app.ts              # Root for the app
```

## Local Development

### Dependencies

Execution using Docker requires:
- [Docker](https://www.docker.com/)
- [Docker Compose](https://docs.docker.com/compose/)

### Using Docker

1 - Execute the following command to run Docker:

```shell
make up-and-build   # First time building Docker or you've made changes to the Dockerfile
make up             # When Docker has already been built and you're starting from where you left off
make logs           # To view the logs for the app
```

The endpoints provided by this microservice should now be available:
[localhost:xxxx](http://localhost:xxxx)\
OpenAPI docs will also be available at [localhost:xxxxx](http://localhost:xxxxx)

2 - Run the following command to lint the project:

```shell
make lint
```

3 - To close Docker:

```shell
make down
```

### Testing

Follow the instruction above for setting up the runtime environment for Docker execution, then run the following to view the test logs:
```shell
make up
make tests
```

## Documentation

The endpoints are documented using the OpenAPI spec and saved under `./docs`.\
A visualisation of these docs will be available to view in a web browser
when developing, please see above.

## Terraform

The provided terraform template will
- build a docker image based on the Dockerfile
- upload the docker image to AWS ECR
- create a new Fargate service in the Forest Watcher AWS ECS cluster using the docker image
- create a new target group for the Fargate service and link it to the Forest Watcher Application Load balancer

The Fargate service will have access to
- Document DB cluster
- Redis Cluster
- S3 Bucket

Relevant endpoints and secrets to access those services are available as environment variables inside the container.

The Forest Watcher Application Load Balancer can be linked to multiple services.
Each service must have a unique path pattern. Path patterns for a given service must be specified in the
lb_listener_rule inputs inside the fargate_autoscaling in the terraform template.
The value of `health_check_path` must match a path_pattern.

An example for a path patterns is

`path_pattern = ["/v1/fw_forms/healthcheck", "/v1/forms*", "/v1/questionnaire*]`

This will route all requests which start with `/v1/forms` or `/v1/questionnaire` to the current service, as well as the specific path `/v1/fw_forms/healthcheck`.
The health_check_path specifies which route the load balancer will perform health checks on. This path must return a HTTP `200` or `202` status code to inform the load balancer the service is healthy. Any other code will be treat the service as unhealthy.
- For the dev and staging environments, each application's routes will also need to be added to the API gateway to be successfully routed once deployed.

The Fargate service is currently configure to run with 0.25 cVPU and 512 MB of RAM. Autoscaling is enabled.
To change configurations, you can update default values for all environments in `/terraform/variables.tf`.
To change configurations for different environments separately, override default values in `/terraform/vars/terraform-{env}.tfvars`.

## Databases

The services currently have access to a AWS DocumentDB cluster (MongoDB 3.6) and a AWS ElasticCache Cluster (Redis 6).
Both database clusters are managed via the GFW core infrastructure repository.
For the case that is become necessary to scale out one of the clusters, please contact the GFW engineering team.

To directly connect to the databases you can create a tunnel via a bastion host using SSH.
You will need to add your public SSH key to the bastion host and add your IP address to the security group to have access.
Please provide this information to the GFW engineering team for setup.

Example:

```bash
# ADD keyfile to chain
ssh-add ~/.ssh/private_key.pem >/dev/null 2>&1

# Create a tunnel to document DB
ssh -N -L 27017:<documentdb cluster dns>:27017 ec2-user@<bastion host ip>
```
You will now be able to connect to the document db cluster via `localhost:27017`

## Git branch naming convention and CI/CD

The branches

- production
- staging
- dev

Represent infrastructure deployment in the according environment accounts on AWS.
Github actions workflows will apply infrastructure changes to these environments automatically,
when ever a commit is pushed to one of the branches.

Pull requests against the branches will trigger a terraform plan action, and the planned infrastructure changes will be displayed first.
It is highly recommended to always work in a feature branch and to make a pull request again the `dev` branch first.
